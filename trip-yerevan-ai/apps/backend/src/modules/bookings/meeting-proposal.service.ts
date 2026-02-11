import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  BookingStatus,
  MeetingProposalStatus,
  MeetingProposer,
} from '@prisma/client';
import { MeetingService } from './meeting.service';
import {
  BookingStateMachineService,
  BookingNotification,
} from './booking-state-machine.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateProposalInput {
  bookingId: string;
  proposedBy: string;
  proposerRole: MeetingProposer;
  proposedDate: Date;
  proposedLocation?: string;
  notes?: string;
}

export interface ProposalResult {
  success: boolean;
  proposalId?: string;
  error?: string;
  notifications: BookingNotification[];
}

export interface AcceptResult {
  success: boolean;
  meetingId?: string;
  error?: string;
  notifications: BookingNotification[];
}

export interface RejectResult {
  success: boolean;
  error?: string;
  notifications: BookingNotification[];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class MeetingProposalService {
  private readonly logger = new Logger(MeetingProposalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly meetingService: MeetingService,
    private readonly stateMachine: BookingStateMachineService,
  ) {}

  async createProposal(input: CreateProposalInput): Promise<ProposalResult> {
    // Validate booking is in MEETING_SCHEDULED status
    const booking = await this.prisma.booking.findUnique({
      where: { id: input.bookingId },
      select: { id: true, status: true },
    });

    if (!booking) {
      return { success: false, error: 'Booking not found.', notifications: [] };
    }

    if (booking.status !== BookingStatus.MEETING_SCHEDULED) {
      return {
        success: false,
        error: `Booking is in ${booking.status} status, expected MEETING_SCHEDULED.`,
        notifications: [],
      };
    }

    // Atomic: expire old PENDING proposals + create new one
    const proposal = await this.prisma.$transaction(async (tx) => {
      await tx.meetingProposal.updateMany({
        where: {
          bookingId: input.bookingId,
          status: MeetingProposalStatus.PENDING,
        },
        data: {
          status: MeetingProposalStatus.EXPIRED,
        },
      });

      return tx.meetingProposal.create({
        data: {
          bookingId: input.bookingId,
          proposedBy: input.proposedBy,
          proposerRole: input.proposerRole,
          proposedDate: input.proposedDate,
          proposedLocation: input.proposedLocation,
          notes: input.notes,
        },
      });
    });

    this.logger.log(
      `[meeting-proposal] Created proposal=${proposal.id} for booking=${input.bookingId} by ${input.proposerRole}`,
    );

    return { success: true, proposalId: proposal.id, notifications: [] };
  }

  async acceptProposal(
    proposalId: string,
    responderId: string,
  ): Promise<AcceptResult> {
    const proposal = await this.prisma.meetingProposal.findUnique({
      where: { id: proposalId },
      include: {
        booking: {
          select: {
            id: true,
            status: true,
            user: { select: { telegramId: true, firstName: true } },
          },
        },
      },
    });

    if (!proposal) {
      return {
        success: false,
        error: 'Proposal not found.',
        notifications: [],
      };
    }

    if (proposal.status !== MeetingProposalStatus.PENDING) {
      return {
        success: false,
        error: `Proposal is already ${proposal.status}.`,
        notifications: [],
      };
    }

    // Mark proposal as accepted
    await this.prisma.meetingProposal.update({
      where: { id: proposalId },
      data: {
        status: MeetingProposalStatus.ACCEPTED,
        respondedBy: responderId,
        respondedAt: new Date(),
      },
    });

    // Create meeting from accepted proposal
    const meetingResult = await this.meetingService.schedule({
      bookingId: proposal.bookingId,
      scheduledBy: responderId,
      scheduledAt: proposal.proposedDate,
      location: proposal.proposedLocation ?? undefined,
      notes: proposal.notes ?? undefined,
    });

    if (!meetingResult.success) {
      this.logger.error(
        `[meeting-proposal] Failed to create meeting from accepted proposal=${proposalId}: ${meetingResult.error}`,
      );
      return {
        success: false,
        error: meetingResult.error,
        notifications: [],
      };
    }

    // Transition booking: MEETING_SCHEDULED → PAYMENT_PENDING
    const transitionResult = await this.stateMachine.transition(
      proposal.bookingId,
      BookingStatus.PAYMENT_PENDING,
      { triggeredBy: responderId },
    );

    this.logger.log(
      `[meeting-proposal] Accepted proposal=${proposalId}, meeting=${meetingResult.meetingId}, booking transitioned to PAYMENT_PENDING`,
    );

    return {
      success: true,
      meetingId: meetingResult.meetingId,
      notifications: transitionResult.notifications,
    };
  }

  async rejectProposal(
    proposalId: string,
    responderId: string,
    reason?: string,
  ): Promise<RejectResult> {
    const proposal = await this.prisma.meetingProposal.findUnique({
      where: { id: proposalId },
      include: {
        booking: {
          select: {
            id: true,
            user: { select: { telegramId: true, firstName: true } },
          },
        },
      },
    });

    if (!proposal) {
      return {
        success: false,
        error: 'Proposal not found.',
        notifications: [],
      };
    }

    if (proposal.status !== MeetingProposalStatus.PENDING) {
      return {
        success: false,
        error: `Proposal is already ${proposal.status}.`,
        notifications: [],
      };
    }

    await this.prisma.meetingProposal.update({
      where: { id: proposalId },
      data: {
        status: MeetingProposalStatus.REJECTED,
        respondedBy: responderId,
        respondedAt: new Date(),
        rejectionReason: reason,
      },
    });

    this.logger.log(
      `[meeting-proposal] Rejected proposal=${proposalId}${reason ? ` reason: ${reason}` : ''}`,
    );

    // Notify the proposer
    const notifications: BookingNotification[] = [];
    const shortId = proposal.booking.id.slice(0, 8);

    if (proposal.proposerRole === MeetingProposer.USER) {
      // Manager rejected traveler's proposal → notify traveler
      notifications.push({
        chatId: Number(proposal.booking.user.telegramId),
        text:
          `\u274c *Meeting Proposal Rejected*\n\n` +
          `Your meeting proposal for booking \`${shortId}...\` was rejected.` +
          (reason ? `\n*Reason:* ${reason}` : '') +
          `\n\nYou can propose a new meeting time.`,
        buttons: [
          {
            label: '\ud83d\udcc5 Propose New Time',
            callbackData: `mpw:start:${proposal.bookingId}`,
          },
        ],
      });
    }
    // If manager's proposal was rejected by traveler, managers get notified via
    // the callback handler's response text (shown inline).

    return { success: true, notifications };
  }

  async counterProposal(
    originalProposalId: string,
    counterInput: CreateProposalInput,
  ): Promise<ProposalResult> {
    const original = await this.prisma.meetingProposal.findUnique({
      where: { id: originalProposalId },
    });

    if (!original) {
      return {
        success: false,
        error: 'Original proposal not found.',
        notifications: [],
      };
    }

    if (original.status !== MeetingProposalStatus.PENDING) {
      return {
        success: false,
        error: `Original proposal is already ${original.status}.`,
        notifications: [],
      };
    }

    // Atomic: mark original as COUNTER_PROPOSED + create new proposal + link
    const newProposal = await this.prisma.$transaction(async (tx) => {
      const created = await tx.meetingProposal.create({
        data: {
          bookingId: counterInput.bookingId,
          proposedBy: counterInput.proposedBy,
          proposerRole: counterInput.proposerRole,
          proposedDate: counterInput.proposedDate,
          proposedLocation: counterInput.proposedLocation,
          notes: counterInput.notes,
        },
      });

      await tx.meetingProposal.update({
        where: { id: originalProposalId },
        data: {
          status: MeetingProposalStatus.COUNTER_PROPOSED,
          respondedBy: counterInput.proposedBy,
          respondedAt: new Date(),
          counterProposalId: created.id,
        },
      });

      return created;
    });

    this.logger.log(
      `[meeting-proposal] Counter-proposal=${newProposal.id} for original=${originalProposalId}`,
    );

    return {
      success: true,
      proposalId: newProposal.id,
      notifications: [],
    };
  }

  async getActiveProposal(bookingId: string) {
    return this.prisma.meetingProposal.findFirst({
      where: {
        bookingId,
        status: MeetingProposalStatus.PENDING,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getProposalChain(bookingId: string) {
    return this.prisma.meetingProposal.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Build notifications to send after a proposal is created.
   * If proposer is USER → notify managers. If MANAGER → notify traveler.
   */
  async buildProposalNotifications(
    proposalId: string,
    proposerRole: MeetingProposer,
    proposedDate: Date,
    proposedLocation?: string,
    notes?: string,
  ): Promise<BookingNotification[]> {
    const proposal = await this.prisma.meetingProposal.findUnique({
      where: { id: proposalId },
      include: {
        booking: {
          select: {
            id: true,
            userId: true,
            user: { select: { telegramId: true, firstName: true } },
            offer: {
              select: {
                travelRequest: { select: { destination: true } },
              },
            },
          },
        },
      },
    });

    if (!proposal) return [];

    const shortId = proposal.booking.id.slice(0, 8);
    const dest =
      proposal.booking.offer.travelRequest.destination ?? 'your trip';
    const dateStr = proposedDate.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    const h = String(proposedDate.getHours()).padStart(2, '0');
    const m = String(proposedDate.getMinutes()).padStart(2, '0');
    const timeStr = `${h}:${m}`;

    const proposalText =
      `\ud83d\udcc5 *Meeting Proposal*\n\n` +
      `*Booking:* \`${shortId}...\`\n` +
      `*Destination:* ${dest}\n` +
      `*Date:* ${dateStr}\n` +
      `*Time:* ${timeStr}\n` +
      (proposedLocation ? `*Location:* ${proposedLocation}\n` : '') +
      (notes ? `*Notes:* ${notes}\n` : '') +
      `\nPlease respond:`;

    const responseButtons = [
      { label: '\u2705 Accept', callbackData: `mpr:accept:${proposalId}` },
      { label: '\ud83d\udd04 Counter', callbackData: `mpr:counter:${proposalId}` },
      { label: '\u274c Reject', callbackData: `mpr:reject:${proposalId}` },
    ];

    const notifications: BookingNotification[] = [];

    if (proposerRole === MeetingProposer.MANAGER) {
      // Manager proposed → notify traveler
      notifications.push({
        chatId: Number(proposal.booking.user.telegramId),
        text: proposalText,
        buttons: responseButtons,
      });
    } else {
      // Traveler proposed → notify all managers
      const managers = await this.prisma.user.findMany({
        where: { role: 'MANAGER', status: 'ACTIVE' },
        select: { telegramId: true },
      });
      for (const mgr of managers) {
        notifications.push({
          chatId: Number(mgr.telegramId),
          text: proposalText,
          buttons: responseButtons,
        });
      }
    }

    return notifications;
  }
}

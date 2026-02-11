import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { UserRole, MeetingProposer, MeetingProposalStatus } from '@prisma/client';
import { BookingNotification } from './booking-state-machine.service';
import { MeetingProposalService } from './meeting-proposal.service';
import { MeetingProposalWizardService } from './meeting-proposal-wizard.service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProposalCallbackResult {
  text: string;
  notifications: BookingNotification[];
  buttons?: { label: string; callbackData: string }[];
  /** When true, a wizard was started — caller should send wizard response */
  wizardStarted?: boolean;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

@Injectable()
export class MeetingProposalCallbackHandler {
  private readonly logger = new Logger(MeetingProposalCallbackHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly proposalService: MeetingProposalService,
    private readonly wizardService: MeetingProposalWizardService,
  ) {}

  async handleCallback(
    callbackData: string,
    actorUserId: string,
    actorRole: UserRole,
    chatId: number,
  ): Promise<ProposalCallbackResult> {
    const parts = callbackData.split(':');
    const action = parts[1]; // accept | reject | counter
    const proposalId = parts[2];

    if (!proposalId) {
      return { text: 'Invalid callback data.', notifications: [] };
    }

    this.logger.log(
      `[proposal-cb] action=${action}, proposalId=${proposalId}, actor=${actorUserId}`,
    );

    // Load proposal with booking relations for auth check
    const proposal = await this.prisma.meetingProposal.findUnique({
      where: { id: proposalId },
      include: {
        booking: {
          select: {
            id: true,
            userId: true,
            user: { select: { telegramId: true, firstName: true } },
          },
        },
      },
    });

    if (!proposal) {
      return { text: 'Proposal not found.', notifications: [] };
    }

    if (proposal.status !== MeetingProposalStatus.PENDING) {
      return {
        text: `This proposal has already been ${proposal.status.toLowerCase().replace('_', ' ')}.`,
        notifications: [],
      };
    }

    // Authorization check
    const authError = this.checkAuth(
      proposal.proposerRole,
      actorUserId,
      actorRole,
      proposal.booking.userId,
    );
    if (authError) {
      return { text: authError, notifications: [] };
    }

    switch (action) {
      case 'accept':
        return this.handleAccept(proposalId, actorUserId, proposal.booking.id);
      case 'reject':
        return this.handleReject(proposalId, actorUserId, proposal.booking.id);
      case 'counter':
        return this.handleCounter(
          proposalId,
          actorUserId,
          actorRole,
          chatId,
          proposal,
        );
      default:
        return { text: 'Unknown proposal action.', notifications: [] };
    }
  }

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------

  private async handleAccept(
    proposalId: string,
    actorUserId: string,
    bookingId: string,
  ): Promise<ProposalCallbackResult> {
    const result = await this.proposalService.acceptProposal(
      proposalId,
      actorUserId,
    );

    if (!result.success) {
      return {
        text: result.error ?? 'Failed to accept proposal.',
        notifications: [],
      };
    }

    const shortId = bookingId.slice(0, 8);
    return {
      text:
        `\u2705 *Meeting Confirmed!*\n\n` +
        `Proposal accepted for booking \`${shortId}...\`\n` +
        `Meeting has been created and payment instructions sent.`,
      notifications: result.notifications,
    };
  }

  private async handleReject(
    proposalId: string,
    actorUserId: string,
    bookingId: string,
  ): Promise<ProposalCallbackResult> {
    const result = await this.proposalService.rejectProposal(
      proposalId,
      actorUserId,
    );

    if (!result.success) {
      return {
        text: result.error ?? 'Failed to reject proposal.',
        notifications: [],
      };
    }

    const shortId = bookingId.slice(0, 8);
    return {
      text: `\u274c Proposal rejected for booking \`${shortId}...\`.`,
      notifications: result.notifications,
    };
  }

  private async handleCounter(
    proposalId: string,
    actorUserId: string,
    actorRole: UserRole,
    chatId: number,
    proposal: {
      proposedDate: Date;
      proposedLocation: string | null;
      notes: string | null;
      booking: { id: string };
    },
  ): Promise<ProposalCallbackResult> {
    // Pre-fill with original proposal values
    const date = proposal.proposedDate;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');

    const wizardResponse = this.wizardService.start(
      chatId,
      proposal.booking.id,
      true,
      proposalId,
      {
        date: `${y}-${m}-${d}`,
        time: `${h}:${min}`,
        location: proposal.proposedLocation ?? undefined,
        notes: proposal.notes ?? undefined,
      },
    );

    return {
      text: wizardResponse.text,
      buttons: wizardResponse.buttons,
      notifications: [],
      wizardStarted: true,
    };
  }

  // -----------------------------------------------------------------------
  // Auth
  // -----------------------------------------------------------------------

  private checkAuth(
    proposerRole: MeetingProposer,
    actorUserId: string,
    actorRole: UserRole,
    bookingUserId: string,
  ): string | null {
    if (proposerRole === MeetingProposer.USER) {
      // Traveler proposed → only managers/admins can respond
      if (
        actorRole !== UserRole.MANAGER &&
        actorRole !== UserRole.ADMIN
      ) {
        return 'Only managers can respond to traveler proposals.';
      }
    } else {
      // Manager proposed → only the booking's traveler can respond
      if (actorUserId !== bookingUserId) {
        return 'Only the booking owner can respond to this proposal.';
      }
    }
    return null;
  }
}

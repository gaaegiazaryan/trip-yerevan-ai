import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MeetingService } from './meeting.service';
import {
  BookingStateMachineService,
  BookingNotification,
} from './booking-state-machine.service';
import { BookingStatus, UserRole } from '@prisma/client';

export interface MeetingCallbackResult {
  text: string;
  notifications: BookingNotification[];
}

@Injectable()
export class MeetingCallbackHandler {
  private readonly logger = new Logger(MeetingCallbackHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly meetingService: MeetingService,
    private readonly stateMachine: BookingStateMachineService,
  ) {}

  async handleCallback(
    callbackData: string,
    actorUserId: string,
    actorRole: UserRole,
  ): Promise<MeetingCallbackResult> {
    const parts = callbackData.split(':');
    const action = parts[1];
    const targetId = parts[2]; // bookingId or meetingId depending on action

    if (!targetId) {
      return { text: 'Invalid callback data.', notifications: [] };
    }

    this.logger.log(
      `[meeting-cb] action=${action}, targetId=${targetId}, actor=${actorUserId}`,
    );

    if (!this.isManagerOrAdmin(actorRole)) {
      return {
        text: 'Only managers can manage meetings.',
        notifications: [],
      };
    }

    switch (action) {
      case 'schedule':
        return this.handleSchedule(targetId, actorUserId);
      case 'confirm':
        return this.handleConfirm(targetId);
      case 'complete':
        return this.handleComplete(targetId, actorUserId);
      case 'noshow':
        return this.handleNoShow(targetId);
      case 'cancel':
        return this.handleCancel(targetId);
      default:
        return { text: 'Unknown meeting action.', notifications: [] };
    }
  }

  // -----------------------------------------------------------------------
  // Schedule: creates a meeting with default time (manager can adjust later)
  // -----------------------------------------------------------------------

  private async handleSchedule(
    bookingId: string,
    actorUserId: string,
  ): Promise<MeetingCallbackResult> {
    // Default: schedule for tomorrow at 14:00
    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + 1);
    scheduledAt.setHours(14, 0, 0, 0);

    const result = await this.meetingService.schedule({
      bookingId,
      scheduledBy: actorUserId,
      scheduledAt,
    });

    if (!result.success) {
      return {
        text: result.error ?? 'Failed to schedule meeting.',
        notifications: [],
      };
    }

    // Load booking for notification building
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        user: { select: { telegramId: true, firstName: true } },
        offer: {
          select: {
            travelRequest: { select: { destination: true } },
          },
        },
      },
    });

    if (!booking) {
      return { text: 'Meeting scheduled.', notifications: [] };
    }

    const shortId = booking.id.slice(0, 8);
    const dest =
      booking.offer.travelRequest.destination ?? 'your trip';
    const dateStr = scheduledAt.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const timeStr = scheduledAt.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const notifications: BookingNotification[] = [];

    // Notify traveler
    notifications.push({
      chatId: Number(booking.user.telegramId),
      text:
        `\ud83d\udcc5 *Meeting Scheduled*\n\n` +
        `A meeting has been scheduled for your booking \`${shortId}...\`\n\n` +
        `*Destination:* ${dest}\n` +
        `*Date:* ${dateStr}\n` +
        `*Time:* ${timeStr}\n\n` +
        `Our manager will contact you to confirm details.`,
    });

    return {
      text: `Meeting scheduled for ${dateStr} at ${timeStr}.`,
      notifications,
    };
  }

  // -----------------------------------------------------------------------
  // Confirm: traveler/manager confirms meeting attendance
  // -----------------------------------------------------------------------

  private async handleConfirm(
    meetingId: string,
  ): Promise<MeetingCallbackResult> {
    const result = await this.meetingService.confirm(meetingId);

    if (!result.success) {
      return {
        text: result.error ?? 'Failed to confirm meeting.',
        notifications: [],
      };
    }

    return { text: 'Meeting confirmed.', notifications: [] };
  }

  // -----------------------------------------------------------------------
  // Complete: meeting done → transition booking to PAYMENT_PENDING
  // -----------------------------------------------------------------------

  private async handleComplete(
    meetingId: string,
    actorUserId: string,
  ): Promise<MeetingCallbackResult> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
      select: { bookingId: true },
    });

    if (!meeting) {
      return { text: 'Meeting not found.', notifications: [] };
    }

    const meetResult = await this.meetingService.complete(meetingId);
    if (!meetResult.success) {
      return {
        text: meetResult.error ?? 'Failed to complete meeting.',
        notifications: [],
      };
    }

    // Transition booking: MEETING_SCHEDULED → PAYMENT_PENDING
    const smResult = await this.stateMachine.transition(
      meeting.bookingId,
      BookingStatus.PAYMENT_PENDING,
      { triggeredBy: actorUserId },
    );

    return {
      text: smResult.success
        ? 'Meeting completed. Payment instructions sent to traveler.'
        : `Meeting completed. ${smResult.error ?? ''}`,
      notifications: smResult.notifications,
    };
  }

  // -----------------------------------------------------------------------
  // No-show
  // -----------------------------------------------------------------------

  private async handleNoShow(
    meetingId: string,
  ): Promise<MeetingCallbackResult> {
    const result = await this.meetingService.noShow(meetingId);

    return {
      text: result.success
        ? 'Meeting marked as no-show.'
        : (result.error ?? 'Failed to mark no-show.'),
      notifications: [],
    };
  }

  // -----------------------------------------------------------------------
  // Cancel meeting (does not cancel the booking)
  // -----------------------------------------------------------------------

  private async handleCancel(
    meetingId: string,
  ): Promise<MeetingCallbackResult> {
    const result = await this.meetingService.cancel(meetingId);

    return {
      text: result.success
        ? 'Meeting cancelled.'
        : (result.error ?? 'Failed to cancel meeting.'),
      notifications: [],
    };
  }

  // -----------------------------------------------------------------------
  // Auth
  // -----------------------------------------------------------------------

  private isManagerOrAdmin(role: UserRole): boolean {
    return role === UserRole.MANAGER || role === UserRole.ADMIN;
  }
}

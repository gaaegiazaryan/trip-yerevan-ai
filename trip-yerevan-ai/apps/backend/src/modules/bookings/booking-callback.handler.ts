import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  BookingStateMachineService,
  BookingNotification,
} from './booking-state-machine.service';
import { BookingStatus, UserRole } from '@prisma/client';

export interface CallbackResult {
  text: string;
  notifications: BookingNotification[];
}

@Injectable()
export class BookingCallbackHandler {
  private readonly logger = new Logger(BookingCallbackHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stateMachine: BookingStateMachineService,
  ) {}

  async handleCallback(
    callbackData: string,
    actorUserId: string,
    actorRole: UserRole,
  ): Promise<CallbackResult> {
    const parts = callbackData.split(':');
    const action = parts[1];
    const bookingId = parts[2];

    if (!bookingId) {
      return { text: 'Invalid callback data.', notifications: [] };
    }

    this.logger.log(
      `[booking-cb] action=${action}, bookingId=${bookingId}, actor=${actorUserId}`,
    );

    switch (action) {
      case 'confirm':
        return this.handleAgencyConfirm(bookingId, actorUserId);
      case 'reject':
        return this.handleAgencyReject(bookingId, actorUserId);
      case 'verify':
        return this.handleManagerVerify(bookingId, actorUserId, actorRole);
      case 'paid':
        return this.handleManagerAction(
          bookingId,
          actorUserId,
          actorRole,
          BookingStatus.PAID,
          'Payment confirmed.',
        );
      case 'start':
        return this.handleManagerAction(
          bookingId,
          actorUserId,
          actorRole,
          BookingStatus.IN_PROGRESS,
          'Trip started.',
        );
      case 'complete':
        return this.handleManagerAction(
          bookingId,
          actorUserId,
          actorRole,
          BookingStatus.COMPLETED,
          'Booking completed.',
        );
      case 'cancel':
        return this.handleCancel(bookingId, actorUserId, actorRole);
      default:
        return { text: 'Unknown booking action.', notifications: [] };
    }
  }

  // -----------------------------------------------------------------------
  // Agency actions
  // -----------------------------------------------------------------------

  private async handleAgencyConfirm(
    bookingId: string,
    actorUserId: string,
  ): Promise<CallbackResult> {
    if (!(await this.isAgencyMember(bookingId, actorUserId))) {
      return {
        text: 'You are not authorized to confirm this booking.',
        notifications: [],
      };
    }

    const result = await this.stateMachine.transition(
      bookingId,
      BookingStatus.AGENCY_CONFIRMED,
      { triggeredBy: actorUserId },
    );

    return {
      text: result.success
        ? 'Booking confirmed.'
        : (result.error ?? 'Failed to confirm.'),
      notifications: result.notifications,
    };
  }

  private async handleAgencyReject(
    bookingId: string,
    actorUserId: string,
  ): Promise<CallbackResult> {
    if (!(await this.isAgencyMember(bookingId, actorUserId))) {
      return {
        text: 'You are not authorized to reject this booking.',
        notifications: [],
      };
    }

    const result = await this.stateMachine.transition(
      bookingId,
      BookingStatus.REJECTED_BY_AGENCY,
      { triggeredBy: actorUserId },
    );

    return {
      text: result.success
        ? 'Booking rejected.'
        : (result.error ?? 'Failed to reject.'),
      notifications: result.notifications,
    };
  }

  // -----------------------------------------------------------------------
  // Manager actions
  // -----------------------------------------------------------------------

  private async handleManagerVerify(
    bookingId: string,
    actorUserId: string,
    actorRole: UserRole,
  ): Promise<CallbackResult> {
    if (!this.isManagerOrAdmin(actorRole)) {
      return {
        text: 'Only managers can verify bookings.',
        notifications: [],
      };
    }

    const verifyResult = await this.stateMachine.transition(
      bookingId,
      BookingStatus.MANAGER_VERIFIED,
      { triggeredBy: actorUserId },
    );

    if (!verifyResult.success) {
      return {
        text: verifyResult.error ?? 'Failed to verify.',
        notifications: verifyResult.notifications,
      };
    }

    // Auto-chain: MANAGER_VERIFIED → MEETING_SCHEDULED
    const meetingResult = await this.stateMachine.transition(
      bookingId,
      BookingStatus.MEETING_SCHEDULED,
      { triggeredBy: actorUserId },
    );

    return {
      text: meetingResult.success
        ? 'Booking verified. Meeting scheduling initiated.'
        : 'Booking verified.',
      notifications: [
        ...verifyResult.notifications,
        ...meetingResult.notifications,
      ],
    };
  }

  private async handleManagerAction(
    bookingId: string,
    actorUserId: string,
    actorRole: UserRole,
    toStatus: BookingStatus,
    successText: string,
  ): Promise<CallbackResult> {
    if (!this.isManagerOrAdmin(actorRole)) {
      return {
        text: 'Only managers can perform this action.',
        notifications: [],
      };
    }

    const result = await this.stateMachine.transition(bookingId, toStatus, {
      triggeredBy: actorUserId,
    });

    return {
      text: result.success
        ? successText
        : (result.error ?? 'Action failed.'),
      notifications: result.notifications,
    };
  }

  private async handleCancel(
    bookingId: string,
    actorUserId: string,
    actorRole: UserRole,
  ): Promise<CallbackResult> {
    if (!this.isManagerOrAdmin(actorRole)) {
      return {
        text: 'Only managers can cancel bookings.',
        notifications: [],
      };
    }

    const result = await this.stateMachine.transition(
      bookingId,
      BookingStatus.CANCELLED,
      { triggeredBy: actorUserId, reason: 'Cancelled by manager' },
    );

    return {
      text: result.success
        ? 'Booking cancelled.'
        : (result.error ?? 'Failed to cancel.'),
      notifications: result.notifications,
    };
  }

  // -----------------------------------------------------------------------
  // Authorization helpers
  // -----------------------------------------------------------------------

  private async isAgencyMember(
    bookingId: string,
    userId: string,
  ): Promise<boolean> {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { agencyId: true },
    });
    if (!booking) return false;

    const membership = await this.prisma.agencyMembership.findFirst({
      where: {
        agencyId: booking.agencyId,
        userId,
        status: 'ACTIVE',
      },
    });
    return !!membership;
  }

  private isManagerOrAdmin(role: UserRole): boolean {
    return role === UserRole.MANAGER || role === UserRole.ADMIN;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MeetingStatus, type Meeting } from '@prisma/client';
import { DEFAULT_MEETING_DURATION_MINUTES } from './meeting.constants';

export interface ScheduleMeetingInput {
  bookingId: string;
  scheduledBy: string;
  scheduledAt: Date;
  location?: string;
  notes?: string;
}

export interface MeetingResult {
  success: boolean;
  meetingId?: string;
  error?: string;
}

@Injectable()
export class MeetingService {
  private readonly logger = new Logger(MeetingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async schedule(input: ScheduleMeetingInput): Promise<MeetingResult> {
    // Conflict detection
    const conflict = await this.hasConflict(input.scheduledBy, input.scheduledAt);
    if (conflict) {
      return {
        success: false,
        error: `Time conflict with existing meeting at ${conflict.scheduledAt.toISOString()}.`,
      };
    }

    // Cancel any existing SCHEDULED meetings for this booking
    await this.prisma.meeting.updateMany({
      where: {
        bookingId: input.bookingId,
        status: MeetingStatus.SCHEDULED,
      },
      data: {
        status: MeetingStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });

    const meeting = await this.prisma.meeting.create({
      data: {
        bookingId: input.bookingId,
        scheduledBy: input.scheduledBy,
        scheduledAt: input.scheduledAt,
        location: input.location,
        notes: input.notes,
      },
    });

    this.logger.log(
      `[meeting] Scheduled meeting=${meeting.id} for booking=${input.bookingId} at ${input.scheduledAt.toISOString()}`,
    );

    return { success: true, meetingId: meeting.id };
  }

  async confirm(meetingId: string): Promise<MeetingResult> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      return { success: false, error: 'Meeting not found.' };
    }

    if (meeting.status !== MeetingStatus.SCHEDULED) {
      return {
        success: false,
        error: `Cannot confirm a meeting in ${meeting.status} status.`,
      };
    }

    await this.prisma.meeting.update({
      where: { id: meetingId },
      data: { status: MeetingStatus.CONFIRMED, confirmedAt: new Date() },
    });

    this.logger.log(`[meeting] Confirmed meeting=${meetingId}`);
    return { success: true, meetingId };
  }

  async complete(meetingId: string): Promise<MeetingResult> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      return { success: false, error: 'Meeting not found.' };
    }

    if (
      meeting.status !== MeetingStatus.SCHEDULED &&
      meeting.status !== MeetingStatus.CONFIRMED
    ) {
      return {
        success: false,
        error: `Cannot complete a meeting in ${meeting.status} status.`,
      };
    }

    await this.prisma.meeting.update({
      where: { id: meetingId },
      data: { status: MeetingStatus.COMPLETED, completedAt: new Date() },
    });

    this.logger.log(`[meeting] Completed meeting=${meetingId}`);
    return { success: true, meetingId };
  }

  async cancel(meetingId: string): Promise<MeetingResult> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      return { success: false, error: 'Meeting not found.' };
    }

    if (
      meeting.status === MeetingStatus.COMPLETED ||
      meeting.status === MeetingStatus.CANCELLED
    ) {
      return {
        success: false,
        error: `Cannot cancel a meeting in ${meeting.status} status.`,
      };
    }

    await this.prisma.meeting.update({
      where: { id: meetingId },
      data: { status: MeetingStatus.CANCELLED, cancelledAt: new Date() },
    });

    this.logger.log(`[meeting] Cancelled meeting=${meetingId}`);
    return { success: true, meetingId };
  }

  async noShow(meetingId: string): Promise<MeetingResult> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      return { success: false, error: 'Meeting not found.' };
    }

    if (
      meeting.status !== MeetingStatus.SCHEDULED &&
      meeting.status !== MeetingStatus.CONFIRMED
    ) {
      return {
        success: false,
        error: `Cannot mark no-show for a meeting in ${meeting.status} status.`,
      };
    }

    await this.prisma.meeting.update({
      where: { id: meetingId },
      data: { status: MeetingStatus.NO_SHOW, completedAt: new Date() },
    });

    this.logger.log(`[meeting] No-show for meeting=${meetingId}`);
    return { success: true, meetingId };
  }

  async findActiveByBookingId(bookingId: string) {
    return this.prisma.meeting.findFirst({
      where: {
        bookingId,
        status: { in: [MeetingStatus.SCHEDULED, MeetingStatus.CONFIRMED] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async hasConflict(
    scheduledBy: string,
    newDate: Date,
    excludeMeetingId?: string,
  ): Promise<Meeting | null> {
    const durationMs = DEFAULT_MEETING_DURATION_MINUTES * 60 * 1000;
    const windowStart = new Date(newDate.getTime() - durationMs);
    const windowEnd = new Date(newDate.getTime() + durationMs);

    return this.prisma.meeting.findFirst({
      where: {
        scheduledBy,
        status: { in: [MeetingStatus.SCHEDULED, MeetingStatus.CONFIRMED] },
        scheduledAt: { gt: windowStart, lt: windowEnd },
        ...(excludeMeetingId ? { id: { not: excludeMeetingId } } : {}),
      },
    });
  }

  async reschedule(
    meetingId: string,
    data: { scheduledAt: Date; location?: string; notes?: string },
  ): Promise<MeetingResult> {
    const meeting = await this.prisma.meeting.findUnique({
      where: { id: meetingId },
    });

    if (!meeting) {
      return { success: false, error: 'Meeting not found.' };
    }

    if (
      meeting.status !== MeetingStatus.SCHEDULED &&
      meeting.status !== MeetingStatus.CONFIRMED
    ) {
      return {
        success: false,
        error: `Cannot reschedule a meeting in ${meeting.status} status.`,
      };
    }

    await this.prisma.meeting.update({
      where: { id: meetingId },
      data: {
        scheduledAt: data.scheduledAt,
        location: data.location ?? meeting.location,
        notes: data.notes ?? meeting.notes,
        status: MeetingStatus.SCHEDULED,
        confirmedAt: null,
      },
    });

    this.logger.log(
      `[meeting] Rescheduled meeting=${meetingId} to ${data.scheduledAt.toISOString()}`,
    );
    return { success: true, meetingId };
  }
}

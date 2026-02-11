import { MeetingStatus } from '@prisma/client';

export const DEFAULT_MEETING_DURATION_MINUTES = 60;

export const MEETING_CALENDAR_COLORS: Record<MeetingStatus, string> = {
  [MeetingStatus.SCHEDULED]: '#409EFF',
  [MeetingStatus.CONFIRMED]: '#67C23A',
  [MeetingStatus.COMPLETED]: '#909399',
  [MeetingStatus.CANCELLED]: '#F56C6C',
  [MeetingStatus.NO_SHOW]: '#E6A23C',
};

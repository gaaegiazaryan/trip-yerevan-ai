import { MeetingService } from '../meeting.service';
import { MeetingStatus } from '@prisma/client';

function createMockPrisma() {
  return {
    meeting: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };
}

describe('MeetingService', () => {
  let service: MeetingService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new MeetingService(prisma as any);
  });

  describe('schedule', () => {
    it('should cancel existing scheduled meetings and create a new one', async () => {
      prisma.meeting.updateMany.mockResolvedValue({ count: 1 });
      prisma.meeting.create.mockResolvedValue({
        id: 'mtg-001',
        bookingId: 'booking-001',
        status: MeetingStatus.SCHEDULED,
      });

      const result = await service.schedule({
        bookingId: 'booking-001',
        scheduledBy: 'manager-001',
        scheduledAt: new Date('2026-03-15T14:00:00Z'),
        location: 'Office',
      });

      expect(result.success).toBe(true);
      expect(result.meetingId).toBe('mtg-001');

      expect(prisma.meeting.updateMany).toHaveBeenCalledWith({
        where: {
          bookingId: 'booking-001',
          status: MeetingStatus.SCHEDULED,
        },
        data: expect.objectContaining({
          status: MeetingStatus.CANCELLED,
        }),
      });

      expect(prisma.meeting.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          bookingId: 'booking-001',
          scheduledBy: 'manager-001',
          location: 'Office',
        }),
      });
    });
  });

  describe('confirm', () => {
    it('should confirm a scheduled meeting', async () => {
      prisma.meeting.findUnique.mockResolvedValue({
        id: 'mtg-001',
        status: MeetingStatus.SCHEDULED,
      });
      prisma.meeting.update.mockResolvedValue({ id: 'mtg-001' });

      const result = await service.confirm('mtg-001');

      expect(result.success).toBe(true);
      expect(prisma.meeting.update).toHaveBeenCalledWith({
        where: { id: 'mtg-001' },
        data: expect.objectContaining({
          status: MeetingStatus.CONFIRMED,
        }),
      });
    });

    it('should reject confirming a completed meeting', async () => {
      prisma.meeting.findUnique.mockResolvedValue({
        id: 'mtg-001',
        status: MeetingStatus.COMPLETED,
      });

      const result = await service.confirm('mtg-001');

      expect(result.success).toBe(false);
      expect(result.error).toContain('COMPLETED');
    });

    it('should return error for non-existent meeting', async () => {
      prisma.meeting.findUnique.mockResolvedValue(null);

      const result = await service.confirm('non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('complete', () => {
    it('should complete a confirmed meeting', async () => {
      prisma.meeting.findUnique.mockResolvedValue({
        id: 'mtg-001',
        status: MeetingStatus.CONFIRMED,
      });
      prisma.meeting.update.mockResolvedValue({ id: 'mtg-001' });

      const result = await service.complete('mtg-001');

      expect(result.success).toBe(true);
      expect(prisma.meeting.update).toHaveBeenCalledWith({
        where: { id: 'mtg-001' },
        data: expect.objectContaining({
          status: MeetingStatus.COMPLETED,
        }),
      });
    });

    it('should complete a scheduled meeting (skip confirm step)', async () => {
      prisma.meeting.findUnique.mockResolvedValue({
        id: 'mtg-001',
        status: MeetingStatus.SCHEDULED,
      });
      prisma.meeting.update.mockResolvedValue({ id: 'mtg-001' });

      const result = await service.complete('mtg-001');

      expect(result.success).toBe(true);
    });

    it('should reject completing a cancelled meeting', async () => {
      prisma.meeting.findUnique.mockResolvedValue({
        id: 'mtg-001',
        status: MeetingStatus.CANCELLED,
      });

      const result = await service.complete('mtg-001');

      expect(result.success).toBe(false);
      expect(result.error).toContain('CANCELLED');
    });
  });

  describe('cancel', () => {
    it('should cancel a scheduled meeting', async () => {
      prisma.meeting.findUnique.mockResolvedValue({
        id: 'mtg-001',
        status: MeetingStatus.SCHEDULED,
      });
      prisma.meeting.update.mockResolvedValue({ id: 'mtg-001' });

      const result = await service.cancel('mtg-001');

      expect(result.success).toBe(true);
    });

    it('should reject cancelling a completed meeting', async () => {
      prisma.meeting.findUnique.mockResolvedValue({
        id: 'mtg-001',
        status: MeetingStatus.COMPLETED,
      });

      const result = await service.cancel('mtg-001');

      expect(result.success).toBe(false);
      expect(result.error).toContain('COMPLETED');
    });
  });

  describe('noShow', () => {
    it('should mark a scheduled meeting as no-show', async () => {
      prisma.meeting.findUnique.mockResolvedValue({
        id: 'mtg-001',
        status: MeetingStatus.SCHEDULED,
      });
      prisma.meeting.update.mockResolvedValue({ id: 'mtg-001' });

      const result = await service.noShow('mtg-001');

      expect(result.success).toBe(true);
      expect(prisma.meeting.update).toHaveBeenCalledWith({
        where: { id: 'mtg-001' },
        data: expect.objectContaining({
          status: MeetingStatus.NO_SHOW,
        }),
      });
    });
  });

  describe('findActiveByBookingId', () => {
    it('should find active meeting for a booking', async () => {
      const meeting = { id: 'mtg-001', status: MeetingStatus.SCHEDULED };
      prisma.meeting.findFirst.mockResolvedValue(meeting);

      const result = await service.findActiveByBookingId('booking-001');

      expect(result).toBe(meeting);
      expect(prisma.meeting.findFirst).toHaveBeenCalledWith({
        where: {
          bookingId: 'booking-001',
          status: { in: [MeetingStatus.SCHEDULED, MeetingStatus.CONFIRMED] },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});

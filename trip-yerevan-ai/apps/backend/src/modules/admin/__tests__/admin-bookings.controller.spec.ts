import { AdminBookingsController } from '../admin-bookings.controller';
import { BookingStatus } from '@prisma/client';
import { DomainException } from '../../../common/exceptions/domain.exception';

function createMockAdminService() {
  return {
    findBookings: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    findBookingById: jest.fn().mockResolvedValue({ id: 'b-1', status: 'AGENCY_CONFIRMED' }),
    verifyBooking: jest.fn().mockResolvedValue({
      success: true,
      booking: { id: 'b-1', status: BookingStatus.MEETING_SCHEDULED },
      notifications: [],
    }),
    findKanbanBookings: jest.fn().mockResolvedValue({
      CREATED: [],
      AWAITING_AGENCY_CONFIRMATION: [],
      AGENCY_CONFIRMED: [{ id: 'b-1', status: 'AGENCY_CONFIRMED' }],
      MANAGER_VERIFIED: [],
      MEETING_SCHEDULED: [],
      PAYMENT_PENDING: [],
      PAID: [],
      IN_PROGRESS: [],
    }),
    assignManager: jest.fn().mockResolvedValue({ success: true }),
    setBookingStatus: jest.fn().mockResolvedValue({
      success: true,
      booking: { id: 'b-1', status: BookingStatus.MANAGER_VERIFIED },
      notifications: [],
    }),
    rescheduleMeeting: jest.fn().mockResolvedValue({
      success: true,
      meetingId: 'm-1',
    }),
  };
}

describe('AdminBookingsController', () => {
  let controller: AdminBookingsController;
  let adminService: ReturnType<typeof createMockAdminService>;

  beforeEach(() => {
    adminService = createMockAdminService();
    controller = new AdminBookingsController(adminService as any);
  });

  // ─── GET /admin/bookings ─────────────────────────────────────────

  describe('GET /admin/bookings', () => {
    it('should return paginated response', async () => {
      adminService.findBookings.mockResolvedValue({
        data: [{ id: 'b-1' }],
        total: 1,
      });

      const result = await controller.findAll({
        page: 1,
        limit: 20,
        get skip() { return 0; },
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
    });

    it('should pass filters to service', async () => {
      await controller.findAll({
        page: 2,
        limit: 10,
        status: BookingStatus.AGENCY_CONFIRMED,
        q: 'Dubai',
        get skip() { return 10; },
      });

      expect(adminService.findBookings).toHaveBeenCalledWith(
        expect.objectContaining({
          status: BookingStatus.AGENCY_CONFIRMED,
          q: 'Dubai',
        }),
      );
    });
  });

  // ─── GET /admin/bookings/kanban ──────────────────────────────────

  describe('GET /admin/bookings/kanban', () => {
    it('should return grouped columns', async () => {
      const result = await controller.getKanban({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!).toHaveProperty('AGENCY_CONFIRMED');
      expect(result.data!['AGENCY_CONFIRMED']).toHaveLength(1);
    });

    it('should pass filters to service', async () => {
      await controller.getKanban({
        from: '2026-01-01',
        to: '2026-02-01',
        q: 'Dubai',
        managerId: 'mgr-1',
      });

      expect(adminService.findKanbanBookings).toHaveBeenCalledWith({
        from: '2026-01-01',
        to: '2026-02-01',
        q: 'Dubai',
        managerId: 'mgr-1',
      });
    });

    it('should return all 8 active columns', async () => {
      const result = await controller.getKanban({});

      const columns = result.data!;
      expect(Object.keys(columns)).toHaveLength(8);
      expect(columns).toHaveProperty('CREATED');
      expect(columns).toHaveProperty('IN_PROGRESS');
    });

    it('should return fail() on error', async () => {
      adminService.findKanbanBookings.mockRejectedValue(new Error('DB timeout'));

      const result = await controller.getKanban({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to load pipeline');
    });
  });

  // ─── GET /admin/bookings/:id ─────────────────────────────────────

  describe('GET /admin/bookings/:id', () => {
    it('should return booking detail wrapped in ok()', async () => {
      const result = await controller.findById('b-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 'b-1', status: 'AGENCY_CONFIRMED' });
    });
  });

  // ─── POST /admin/bookings/:id/verify ─────────────────────────────

  describe('POST /admin/bookings/:id/verify', () => {
    it('should return success on CONFIRM', async () => {
      const result = await controller.verify(
        'b-1',
        { action: 'CONFIRM', notes: 'OK' },
        'mgr-1',
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          message: 'Booking verified successfully.',
          bookingId: 'b-1',
          status: BookingStatus.MEETING_SCHEDULED,
        }),
      );
    });

    it('should return success on REJECT', async () => {
      adminService.verifyBooking.mockResolvedValue({
        success: true,
        booking: { id: 'b-1', status: BookingStatus.CANCELLED },
        notifications: [],
      });

      const result = await controller.verify(
        'b-1',
        { action: 'REJECT', notes: 'Bad price' },
        'mgr-1',
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          message: 'Booking rejected successfully.',
        }),
      );
    });

    it('should return failure when state machine rejects', async () => {
      adminService.verifyBooking.mockResolvedValue({
        success: false,
        error: 'Invalid transition',
        notifications: [],
      });

      const result = await controller.verify(
        'b-1',
        { action: 'CONFIRM' },
        'mgr-1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid transition');
    });
  });

  // ─── POST /admin/bookings/:id/assign-manager ────────────────────

  describe('POST /admin/bookings/:id/assign-manager', () => {
    it('should assign manager and return success', async () => {
      const result = await controller.assignManager('b-1', {
        managerId: 'mgr-1',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          message: 'Manager assigned.',
          bookingId: 'b-1',
        }),
      );
      expect(adminService.assignManager).toHaveBeenCalledWith('b-1', 'mgr-1');
    });

    it('should return fail() when manager is invalid', async () => {
      adminService.assignManager.mockRejectedValue(
        new DomainException('Target user is not an active manager.'),
      );

      const result = await controller.assignManager('b-1', {
        managerId: 'not-a-manager',
      });

      expect(result.success).toBe(false);
    });

    it('should return fail() on unexpected error', async () => {
      adminService.assignManager.mockRejectedValue(new Error('DB error'));

      const result = await controller.assignManager('b-1', {
        managerId: 'mgr-1',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to assign manager');
    });
  });

  // ─── POST /admin/bookings/:id/set-status ─────────────────────────

  describe('POST /admin/bookings/:id/set-status', () => {
    it('should change status via state machine', async () => {
      const result = await controller.setStatus(
        'b-1',
        { status: BookingStatus.MANAGER_VERIFIED },
        'mgr-1',
      );

      expect(result.success).toBe(true);
      expect(result.data!).toEqual(
        expect.objectContaining({
          message: `Status changed to ${BookingStatus.MANAGER_VERIFIED}.`,
          bookingId: 'b-1',
          status: BookingStatus.MANAGER_VERIFIED,
        }),
      );
      expect(adminService.setBookingStatus).toHaveBeenCalledWith(
        'b-1',
        BookingStatus.MANAGER_VERIFIED,
        undefined,
        'mgr-1',
      );
    });

    it('should pass reason to service', async () => {
      await controller.setStatus(
        'b-1',
        { status: BookingStatus.CANCELLED, reason: 'Customer request' },
        'mgr-1',
      );

      expect(adminService.setBookingStatus).toHaveBeenCalledWith(
        'b-1',
        BookingStatus.CANCELLED,
        'Customer request',
        'mgr-1',
      );
    });

    it('should return failure when transition is invalid', async () => {
      adminService.setBookingStatus.mockResolvedValue({
        success: false,
        error: 'Cannot transition from CREATED to COMPLETED.',
        notifications: [],
      });

      const result = await controller.setStatus(
        'b-1',
        { status: BookingStatus.COMPLETED },
        'mgr-1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot transition');
    });

    it('should return fail() on unexpected error', async () => {
      adminService.setBookingStatus.mockRejectedValue(new Error('DB error'));

      const result = await controller.setStatus(
        'b-1',
        { status: BookingStatus.MANAGER_VERIFIED },
        'mgr-1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to change booking status');
    });
  });

  // ─── POST /admin/bookings/:id/reschedule-proposal ────────────────

  describe('POST /admin/bookings/:id/reschedule-proposal', () => {
    it('should delegate to rescheduleMeeting', async () => {
      const result = await controller.rescheduleProposal(
        'b-1',
        { suggestedAt: '2026-03-15T14:00:00Z', location: 'Office' },
        'mgr-1',
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          message: 'Meeting rescheduled.',
          bookingId: 'b-1',
        }),
      );
      expect(adminService.rescheduleMeeting).toHaveBeenCalledWith(
        'b-1',
        { dateTime: '2026-03-15T14:00:00Z', location: 'Office' },
        'mgr-1',
      );
    });

    it('should return fail() when conflict exists', async () => {
      adminService.rescheduleMeeting.mockResolvedValue({
        success: false,
        error: 'Time conflict: another meeting is scheduled.',
      });

      const result = await controller.rescheduleProposal(
        'b-1',
        { suggestedAt: '2026-03-15T14:00:00Z' },
        'mgr-1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Time conflict');
    });

    it('should return fail() on unexpected error', async () => {
      adminService.rescheduleMeeting.mockRejectedValue(new Error('DB error'));

      const result = await controller.rescheduleProposal(
        'b-1',
        { suggestedAt: '2026-03-15T14:00:00Z' },
        'mgr-1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to reschedule');
    });
  });
});

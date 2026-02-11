import { AdminMeetingsController } from '../admin-meetings.controller';

function createMockAdminService() {
  return {
    findMeetings: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    confirmMeeting: jest.fn().mockResolvedValue({ success: true, meetingId: 'm-1' }),
    completeMeeting: jest.fn().mockResolvedValue({
      success: true,
      booking: { id: 'b-1', status: 'PAYMENT_PENDING' },
      notifications: [],
    }),
    counterProposeMeeting: jest.fn().mockResolvedValue({
      success: true,
      proposalId: 'p-2',
      notifications: [],
    }),
    cancelMeeting: jest.fn().mockResolvedValue({ success: true, meetingId: 'm-1' }),
  };
}

describe('AdminMeetingsController', () => {
  let controller: AdminMeetingsController;
  let adminService: ReturnType<typeof createMockAdminService>;

  beforeEach(() => {
    adminService = createMockAdminService();
    controller = new AdminMeetingsController(adminService as any);
  });

  describe('GET /admin/meetings', () => {
    it('should return paginated meetings', async () => {
      adminService.findMeetings.mockResolvedValue({
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
      expect(result.meta!.total).toBe(1);
    });
  });

  describe('POST /admin/meetings/:id/confirm', () => {
    it('should return success on confirm', async () => {
      const result = await controller.confirm('b-1', 'mgr-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          message: 'Meeting confirmed.',
          meetingId: 'm-1',
          bookingId: 'b-1',
        }),
      );
    });

    it('should return failure when service fails', async () => {
      adminService.confirmMeeting.mockResolvedValue({
        success: false,
        error: 'Already confirmed',
      });

      const result = await controller.confirm('b-1', 'mgr-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Already confirmed');
    });
  });

  describe('POST /admin/meetings/:id/counter-propose', () => {
    it('should return success with proposalId', async () => {
      const result = await controller.counterPropose(
        'b-1',
        { dateTime: '2026-03-15T14:00:00Z', location: 'Zoom' },
        'mgr-1',
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          message: 'Counter-proposal submitted.',
          proposalId: 'p-2',
          bookingId: 'b-1',
        }),
      );
    });

    it('should return failure when no active proposal', async () => {
      adminService.counterProposeMeeting.mockResolvedValue({
        success: false,
        error: 'No active proposal',
        notifications: [],
      });

      const result = await controller.counterPropose(
        'b-1',
        { dateTime: '2026-03-15T14:00:00Z' },
        'mgr-1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('No active proposal');
    });
  });

  describe('POST /admin/meetings/:id/complete', () => {
    it('should return success with booking status', async () => {
      const result = await controller.complete(
        'b-1',
        { notes: 'Done', amount: 1500, paymentMethod: 'CASH' },
        'mgr-1',
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          message: 'Meeting completed.',
          bookingId: 'b-1',
          status: 'PAYMENT_PENDING',
        }),
      );
    });
  });

  describe('POST /admin/meetings/:id/cancel', () => {
    it('should return success on cancel', async () => {
      const result = await controller.cancel(
        'b-1',
        { reason: 'Reschedule' },
        'mgr-1',
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          message: 'Meeting cancelled.',
          meetingId: 'm-1',
          bookingId: 'b-1',
        }),
      );
    });

    it('should return failure when cancel fails', async () => {
      adminService.cancelMeeting.mockResolvedValue({
        success: false,
        error: 'Already cancelled',
      });

      const result = await controller.cancel('b-1', {}, 'mgr-1');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Already cancelled');
    });
  });
});

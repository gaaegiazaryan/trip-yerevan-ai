import { AdminCalendarController } from '../admin-calendar.controller';

function createMockAdminService() {
  return {
    getCalendarEvents: jest.fn().mockResolvedValue([]),
    rescheduleMeeting: jest.fn().mockResolvedValue({
      success: true,
      meetingId: 'm-1',
    }),
  };
}

describe('AdminCalendarController', () => {
  let controller: AdminCalendarController;
  let adminService: ReturnType<typeof createMockAdminService>;

  beforeEach(() => {
    adminService = createMockAdminService();
    controller = new AdminCalendarController(adminService as any);
  });

  describe('GET /admin/calendar', () => {
    it('should return calendar events for a date range', async () => {
      const events = [
        {
          id: 'm-1',
          title: 'John — Dubai',
          start: '2026-02-10T10:00:00.000Z',
          end: '2026-02-10T11:00:00.000Z',
          status: 'SCHEDULED',
          color: '#409EFF',
          extendedProps: {
            bookingId: 'b-1',
            meetingId: 'm-1',
            userName: 'John',
            agencyName: 'TravelPro',
            destination: 'Dubai',
            location: 'Office',
            notes: null,
            status: 'SCHEDULED',
          },
        },
      ];
      adminService.getCalendarEvents.mockResolvedValue(events);

      const result = await controller.getCalendarEvents({
        from: '2026-02-01',
        to: '2026-02-28',
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].title).toBe('John — Dubai');
      expect(adminService.getCalendarEvents).toHaveBeenCalledWith({
        from: '2026-02-01',
        to: '2026-02-28',
      });
    });

    it('should pass managerId filter when provided', async () => {
      await controller.getCalendarEvents({
        from: '2026-02-01',
        to: '2026-02-28',
        managerId: 'mgr-1',
      });

      expect(adminService.getCalendarEvents).toHaveBeenCalledWith({
        from: '2026-02-01',
        to: '2026-02-28',
        managerId: 'mgr-1',
      });
    });

    it('should return empty array when no meetings in range', async () => {
      const result = await controller.getCalendarEvents({
        from: '2026-01-01',
        to: '2026-01-31',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('POST /admin/calendar/:id/reschedule', () => {
    it('should return success on reschedule', async () => {
      const result = await controller.reschedule(
        'b-1',
        { dateTime: '2026-02-15T14:00:00Z', location: 'Zoom' },
        'mgr-1',
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          message: 'Meeting rescheduled.',
          meetingId: 'm-1',
          bookingId: 'b-1',
        }),
      );
      expect(adminService.rescheduleMeeting).toHaveBeenCalledWith(
        'b-1',
        { dateTime: '2026-02-15T14:00:00Z', location: 'Zoom' },
        'mgr-1',
      );
    });

    it('should return failure when conflict detected', async () => {
      adminService.rescheduleMeeting.mockResolvedValue({
        success: false,
        error: 'Time conflict: another meeting is scheduled at 2026-02-15T14:00:00.000Z.',
      });

      const result = await controller.reschedule(
        'b-1',
        { dateTime: '2026-02-15T14:00:00Z' },
        'mgr-1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Time conflict');
    });

    it('should return failure when no active meeting', async () => {
      adminService.rescheduleMeeting.mockRejectedValue(
        new Error('No active meeting found for this booking.'),
      );

      await expect(
        controller.reschedule('b-1', { dateTime: '2026-02-15T14:00:00Z' }, 'mgr-1'),
      ).rejects.toThrow('No active meeting');
    });
  });
});

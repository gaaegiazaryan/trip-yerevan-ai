import { AdminTravelersController } from '../admin-travelers.controller';
import { NotFoundException } from '@nestjs/common';

function createMockAdminService() {
  return {
    findTravelers: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    findTravelerById: jest.fn().mockResolvedValue({
      id: 'u-1',
      telegramId: '123456789',
      firstName: 'John',
      lastName: 'Doe',
      phone: '+37412345678',
      preferredLanguage: 'RU',
      vip: false,
      blacklisted: false,
      blacklistReason: null,
      createdAt: new Date().toISOString(),
      travelRequests: [],
      bookings: [],
    }),
    setVip: jest.fn().mockResolvedValue({
      success: true,
      user: { id: 'u-1', vip: true },
    }),
    setBlacklist: jest.fn().mockResolvedValue({
      success: true,
      user: { id: 'u-1', blacklisted: true, blacklistReason: 'Spam' },
    }),
  };
}

function queryDto(overrides = {}) {
  const dto = { page: 1, limit: 20, get skip() { return 0; }, ...overrides };
  return dto;
}

describe('AdminTravelersController', () => {
  let controller: AdminTravelersController;
  let adminService: ReturnType<typeof createMockAdminService>;

  beforeEach(() => {
    adminService = createMockAdminService();
    controller = new AdminTravelersController(adminService as any);
  });

  // ─── GET /admin/travelers ─────────────────────────────────────────

  describe('GET /admin/travelers', () => {
    it('should return paginated response', async () => {
      adminService.findTravelers.mockResolvedValue({
        data: [{ id: 'u-1', firstName: 'John' }],
        total: 1,
      });

      const result = await controller.findAll(queryDto());

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
    });

    it('should pass search query to service', async () => {
      await controller.findAll(queryDto({ q: 'John' }));

      expect(adminService.findTravelers).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'John' }),
      );
    });

    it('should pass vip filter to service', async () => {
      await controller.findAll(queryDto({ vip: true }));

      expect(adminService.findTravelers).toHaveBeenCalledWith(
        expect.objectContaining({ vip: true }),
      );
    });

    it('should pass blacklisted filter to service', async () => {
      await controller.findAll(queryDto({ blacklisted: true }));

      expect(adminService.findTravelers).toHaveBeenCalledWith(
        expect.objectContaining({ blacklisted: true }),
      );
    });

    it('should return empty list when no travelers match', async () => {
      const result = await controller.findAll(queryDto());

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
      expect(result.meta!.total).toBe(0);
    });

    it('should return fail() when service throws', async () => {
      adminService.findTravelers.mockRejectedValue(new Error('DB timeout'));

      const result = await controller.findAll(queryDto());

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to load travelers');
    });
  });

  // ─── GET /admin/travelers/:id ─────────────────────────────────────

  describe('GET /admin/travelers/:id', () => {
    it('should return traveler detail wrapped in ok()', async () => {
      const result = await controller.findById('u-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({ id: 'u-1', firstName: 'John' }),
      );
    });

    it('should return fail() when traveler not found', async () => {
      adminService.findTravelerById.mockRejectedValue(
        new NotFoundException('Traveler not-exist not found.'),
      );

      const result = await controller.findById('not-exist');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Traveler not found.');
    });

    it('should return fail() on unexpected error', async () => {
      adminService.findTravelerById.mockRejectedValue(
        new Error('Connection lost'),
      );

      const result = await controller.findById('u-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to load traveler');
    });
  });

  // ─── POST /admin/travelers/:id/vip ────────────────────────────────

  describe('POST /admin/travelers/:id/vip', () => {
    it('should enable VIP and return success', async () => {
      const result = await controller.setVip(
        'u-1',
        { enabled: true },
        'mgr-1',
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          message: 'VIP enabled.',
          userId: 'u-1',
          vip: true,
        }),
      );
      expect(adminService.setVip).toHaveBeenCalledWith(
        'u-1',
        { enabled: true },
        'mgr-1',
      );
    });

    it('should disable VIP', async () => {
      const result = await controller.setVip(
        'u-1',
        { enabled: false },
        'mgr-1',
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          message: 'VIP disabled.',
          vip: false,
        }),
      );
    });

    it('should return fail() when traveler not found', async () => {
      adminService.setVip.mockRejectedValue(
        new NotFoundException('Traveler not found.'),
      );

      const result = await controller.setVip(
        'not-exist',
        { enabled: true },
        'mgr-1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Traveler not found.');
    });

    it('should pass managerId from @CurrentUser', async () => {
      await controller.setVip('u-1', { enabled: true }, 'mgr-42');

      expect(adminService.setVip).toHaveBeenCalledWith(
        'u-1',
        expect.anything(),
        'mgr-42',
      );
    });
  });

  // ─── POST /admin/travelers/:id/blacklist ──────────────────────────

  describe('POST /admin/travelers/:id/blacklist', () => {
    it('should blacklist traveler with reason', async () => {
      const result = await controller.setBlacklist(
        'u-1',
        { enabled: true, reason: 'Spam activity' },
        'mgr-1',
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          message: 'Traveler has been blacklisted.',
          userId: 'u-1',
          blacklisted: true,
        }),
      );
      expect(adminService.setBlacklist).toHaveBeenCalledWith(
        'u-1',
        { enabled: true, reason: 'Spam activity' },
        'mgr-1',
      );
    });

    it('should remove from blacklist', async () => {
      const result = await controller.setBlacklist(
        'u-1',
        { enabled: false },
        'mgr-1',
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          message: 'Traveler has been removed from blacklist.',
          blacklisted: false,
        }),
      );
    });

    it('should return fail() when traveler not found', async () => {
      adminService.setBlacklist.mockRejectedValue(
        new NotFoundException('Traveler not found.'),
      );

      const result = await controller.setBlacklist(
        'not-exist',
        { enabled: true },
        'mgr-1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Traveler not found.');
    });

    it('should pass managerId from @CurrentUser', async () => {
      await controller.setBlacklist(
        'u-1',
        { enabled: true, reason: 'Test' },
        'mgr-42',
      );

      expect(adminService.setBlacklist).toHaveBeenCalledWith(
        'u-1',
        expect.anything(),
        'mgr-42',
      );
    });
  });
});

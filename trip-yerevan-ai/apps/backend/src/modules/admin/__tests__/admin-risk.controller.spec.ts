import { AdminRiskController } from '../admin-risk.controller';
import { RiskSeverity, RiskEntityType } from '@prisma/client';

function createMockAdminService() {
  return {
    findRiskEvents: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    findRiskEventById: jest.fn().mockResolvedValue({
      id: 'r-1',
      entityType: RiskEntityType.PROXY_CHAT,
      entityId: 'pc-1',
      severity: RiskSeverity.MED,
      reason: 'Contact leak blocked: phone_number',
      payload: { senderId: 'u-1', violations: ['phone_number'] },
      createdAt: new Date('2026-02-11T10:00:00Z'),
    }),
  };
}

describe('AdminRiskController', () => {
  let controller: AdminRiskController;
  let adminService: ReturnType<typeof createMockAdminService>;

  beforeEach(() => {
    adminService = createMockAdminService();
    controller = new AdminRiskController(adminService as any);
  });

  // ─── GET /admin/risk/events ────────────────────────────────────

  describe('GET /admin/risk/events', () => {
    it('should return paginated response', async () => {
      adminService.findRiskEvents.mockResolvedValue({
        data: [{ id: 'r-1' }],
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

    it('should pass severity filter to service', async () => {
      await controller.findAll({
        page: 1,
        limit: 20,
        severity: RiskSeverity.HIGH,
        get skip() { return 0; },
      });

      expect(adminService.findRiskEvents).toHaveBeenCalledWith(
        expect.objectContaining({ severity: RiskSeverity.HIGH }),
      );
    });

    it('should pass entityType filter to service', async () => {
      await controller.findAll({
        page: 1,
        limit: 20,
        entityType: RiskEntityType.PROXY_CHAT,
        get skip() { return 0; },
      });

      expect(adminService.findRiskEvents).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: RiskEntityType.PROXY_CHAT }),
      );
    });

    it('should return empty list when no events', async () => {
      const result = await controller.findAll({
        page: 1,
        limit: 20,
        get skip() { return 0; },
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(0);
      expect(result.meta!.total).toBe(0);
    });
  });

  // ─── GET /admin/risk/events/:id ────────────────────────────────

  describe('GET /admin/risk/events/:id', () => {
    it('should return risk event detail wrapped in ok()', async () => {
      const result = await controller.findById('r-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          id: 'r-1',
          entityType: RiskEntityType.PROXY_CHAT,
          severity: RiskSeverity.MED,
        }),
      );
    });

    it('should pass the id to service', async () => {
      await controller.findById('r-1');

      expect(adminService.findRiskEventById).toHaveBeenCalledWith('r-1');
    });
  });
});

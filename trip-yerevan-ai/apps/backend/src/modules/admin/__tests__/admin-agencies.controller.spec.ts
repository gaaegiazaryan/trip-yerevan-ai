import { AdminAgenciesController } from '../admin-agencies.controller';
import { NotFoundException } from '@nestjs/common';
import { AgencyStatus } from '@prisma/client';

function createMockAdminService() {
  return {
    findAgencies: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    findAgencyById: jest.fn().mockResolvedValue({
      id: 'a-1',
      name: 'Test Agency',
      status: AgencyStatus.PENDING,
      _count: { offers: 5, bookings: 2, memberships: 3 },
    }),
    verifyAgency: jest.fn().mockResolvedValue({
      success: true,
      agency: { id: 'a-1', status: AgencyStatus.APPROVED },
    }),
    setTrustBadge: jest.fn().mockResolvedValue({
      success: true,
      agency: { id: 'a-1', trustBadge: true },
    }),
    getAgencyPerformance: jest.fn().mockResolvedValue({
      agencyId: 'a-1',
      agencyName: 'Test Agency',
      offersSent: 20,
      bookingsWon: 8,
      winRate: 40,
      avgOfferPrice: 1200.5,
      avgResponseHours: 2.3,
      totalRevenue: 9600,
      cancellationRate: 10,
    }),
    getAgencyPerformanceRanking: jest.fn().mockResolvedValue([
      {
        agencyId: 'a-1',
        agencyName: 'Top Agency',
        trustBadge: true,
        offersSent: 50,
        bookingsWon: 25,
        winRate: 50,
        avgOfferPrice: 1500,
        avgResponseHours: 1.5,
        totalRevenue: 37500,
        cancellationRate: 4,
      },
      {
        agencyId: 'a-2',
        agencyName: 'Second Agency',
        trustBadge: false,
        offersSent: 30,
        bookingsWon: 10,
        winRate: 33,
        avgOfferPrice: 900,
        avgResponseHours: 4.2,
        totalRevenue: 9000,
        cancellationRate: 7,
      },
    ]),
  };
}

function queryDto(overrides = {}) {
  const dto = { page: 1, limit: 20, get skip() { return 0; }, ...overrides };
  return dto;
}

describe('AdminAgenciesController', () => {
  let controller: AdminAgenciesController;
  let adminService: ReturnType<typeof createMockAdminService>;

  beforeEach(() => {
    adminService = createMockAdminService();
    controller = new AdminAgenciesController(adminService as any);
  });

  // ─── GET /admin/agencies ────────────────────────────────────────────

  describe('GET /admin/agencies', () => {
    it('should return paginated response', async () => {
      adminService.findAgencies.mockResolvedValue({
        data: [{ id: 'a-1', name: 'Agency 1' }],
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

    it('should pass status filter to service', async () => {
      await controller.findAll(queryDto({ status: AgencyStatus.PENDING }));

      expect(adminService.findAgencies).toHaveBeenCalledWith(
        expect.objectContaining({ status: AgencyStatus.PENDING }),
      );
    });

    it('should pass search query to service', async () => {
      await controller.findAll(queryDto({ q: 'Armenia' }));

      expect(adminService.findAgencies).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'Armenia' }),
      );
    });

    it('should return empty list when no agencies match', async () => {
      const result = await controller.findAll(queryDto());

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
      expect(result.meta!.total).toBe(0);
    });

    it('should return fail() when service throws', async () => {
      adminService.findAgencies.mockRejectedValue(new Error('DB timeout'));

      const result = await controller.findAll(queryDto());

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to load agencies');
    });
  });

  // ─── GET /admin/agencies/:id ────────────────────────────────────────

  describe('GET /admin/agencies/:id', () => {
    it('should return agency detail wrapped in ok()', async () => {
      const result = await controller.findById('a-1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({ id: 'a-1', name: 'Test Agency' }),
      );
    });

    it('should return fail() when agency not found', async () => {
      adminService.findAgencyById.mockRejectedValue(
        new NotFoundException('Agency not-exist not found.'),
      );

      const result = await controller.findById('not-exist');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Agency not found.');
    });

    it('should return fail() on unexpected error', async () => {
      adminService.findAgencyById.mockRejectedValue(new Error('Connection lost'));

      const result = await controller.findById('a-1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to load agency');
    });
  });

  // ─── POST /admin/agencies/:id/verify ────────────────────────────────

  describe('POST /admin/agencies/:id/verify', () => {
    it('should approve agency and return success', async () => {
      const result = await controller.verify(
        'a-1',
        { action: 'APPROVE' },
        'mgr-1',
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          message: 'Agency approved successfully.',
          agencyId: 'a-1',
          status: AgencyStatus.APPROVED,
        }),
      );
      expect(adminService.verifyAgency).toHaveBeenCalledWith(
        'a-1',
        { action: 'APPROVE' },
        'mgr-1',
      );
    });

    it('should reject agency with reason', async () => {
      adminService.verifyAgency.mockResolvedValue({
        success: true,
        agency: { id: 'a-1', status: AgencyStatus.REJECTED },
      });

      const result = await controller.verify(
        'a-1',
        { action: 'REJECT', reason: 'Incomplete docs' },
        'mgr-1',
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({ message: 'Agency rejected successfully.' }),
      );
    });

    it('should block agency', async () => {
      adminService.verifyAgency.mockResolvedValue({
        success: true,
        agency: { id: 'a-1', status: AgencyStatus.BLOCKED },
      });

      const result = await controller.verify(
        'a-1',
        { action: 'BLOCK', reason: 'Fraud detected' },
        'mgr-1',
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({ message: 'Agency blocked successfully.' }),
      );
    });

    it('should pass managerId from @CurrentUser to service', async () => {
      await controller.verify('a-1', { action: 'APPROVE' }, 'mgr-42');

      expect(adminService.verifyAgency).toHaveBeenCalledWith(
        'a-1',
        expect.anything(),
        'mgr-42',
      );
    });

    it('should return fail() when agency not found', async () => {
      adminService.verifyAgency.mockRejectedValue(
        new NotFoundException('Agency not found.'),
      );

      const result = await controller.verify(
        'not-exist',
        { action: 'APPROVE' },
        'mgr-1',
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Agency not found.');
    });
  });

  // ─── POST /admin/agencies/:id/trust-badge ───────────────────────────

  describe('POST /admin/agencies/:id/trust-badge', () => {
    it('should enable trust badge', async () => {
      const result = await controller.setTrustBadge('a-1', { enabled: true });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          message: 'Trust badge enabled.',
          trustBadge: true,
        }),
      );
    });

    it('should disable trust badge', async () => {
      adminService.setTrustBadge.mockResolvedValue({
        success: true,
        agency: { id: 'a-1', trustBadge: false },
      });

      const result = await controller.setTrustBadge('a-1', { enabled: false });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          message: 'Trust badge disabled.',
          trustBadge: false,
        }),
      );
    });

    it('should return fail() when agency not found', async () => {
      adminService.setTrustBadge.mockRejectedValue(
        new NotFoundException('Agency not found.'),
      );

      const result = await controller.setTrustBadge('not-exist', { enabled: true });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Agency not found.');
    });
  });

  // ─── GET /admin/agencies/performance/ranking ───────────────────────

  describe('GET /admin/agencies/performance/ranking', () => {
    it('should return ranking array wrapped in ok()', async () => {
      const result = await controller.getPerformanceRanking({});

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!).toHaveLength(2);
      expect(result.data![0].agencyName).toBe('Top Agency');
      expect(result.data![0].totalRevenue).toBe(37500);
    });

    it('should pass sort param to service', async () => {
      await controller.getPerformanceRanking({ sort: 'winRate' });

      expect(adminService.getAgencyPerformanceRanking).toHaveBeenCalledWith(
        expect.objectContaining({ sort: 'winRate' }),
      );
    });

    it('should pass date range to service', async () => {
      await controller.getPerformanceRanking({
        from: '2026-01-01',
        to: '2026-01-31',
      });

      expect(adminService.getAgencyPerformanceRanking).toHaveBeenCalledWith(
        expect.objectContaining({ from: '2026-01-01', to: '2026-01-31' }),
      );
    });

    it('should return fail() when service throws', async () => {
      adminService.getAgencyPerformanceRanking.mockRejectedValue(
        new Error('Redis down'),
      );

      const result = await controller.getPerformanceRanking({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to load agency ranking');
    });
  });

  // ─── GET /admin/agencies/:id/performance ───────────────────────────

  describe('GET /admin/agencies/:id/performance', () => {
    it('should return performance metrics wrapped in ok()', async () => {
      const result = await controller.getPerformance('a-1', {});

      expect(result.success).toBe(true);
      expect(result.data).toEqual(
        expect.objectContaining({
          agencyId: 'a-1',
          offersSent: 20,
          bookingsWon: 8,
          winRate: 40,
          totalRevenue: 9600,
        }),
      );
    });

    it('should pass date range to service', async () => {
      await controller.getPerformance('a-1', {
        from: '2026-02-01',
        to: '2026-02-28',
      });

      expect(adminService.getAgencyPerformance).toHaveBeenCalledWith(
        'a-1',
        expect.objectContaining({ from: '2026-02-01', to: '2026-02-28' }),
      );
    });

    it('should return fail() when agency not found', async () => {
      adminService.getAgencyPerformance.mockRejectedValue(
        new NotFoundException('Agency not found.'),
      );

      const result = await controller.getPerformance('not-exist', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Agency not found.');
    });

    it('should return fail() on unexpected error', async () => {
      adminService.getAgencyPerformance.mockRejectedValue(
        new Error('Query timeout'),
      );

      const result = await controller.getPerformance('a-1', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to load agency performance');
    });
  });
});

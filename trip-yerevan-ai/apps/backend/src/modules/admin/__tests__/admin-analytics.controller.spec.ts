import { AdminAnalyticsController } from '../admin-analytics.controller';
import { AdminService } from '../admin.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockOverview = {
  funnel: {
    travelRequests: 50,
    withOffers: 30,
    withBookings: 15,
    withMeetings: 10,
    paid: 7,
    completed: 5,
  },
  revenue: {
    total: 25000,
    average: 5000,
    count: 5,
    byCurrency: [{ currency: 'USD', total: 25000 }],
  },
  trends: [
    { date: '2026-02-01', travelRequests: 5, offers: 3, bookings: 1 },
    { date: '2026-02-02', travelRequests: 8, offers: 4, bookings: 2 },
  ],
  responseTimes: {
    avgOfferResponseHours: 4.5,
    avgAgencyConfirmHours: 12.3,
  },
};

const emptyOverview = {
  funnel: {
    travelRequests: 0,
    withOffers: 0,
    withBookings: 0,
    withMeetings: 0,
    paid: 0,
    completed: 0,
  },
  revenue: { total: 0, average: 0, count: 0, byCurrency: [] },
  trends: [],
  responseTimes: {
    avgOfferResponseHours: null,
    avgAgencyConfirmHours: null,
  },
};

const mockAgencies = [
  {
    id: 'a-1',
    name: 'TravelPro',
    status: 'APPROVED',
    offersCount: 20,
    bookingsCount: 8,
    conversionRate: 40,
    avgResponseHours: 3.2,
    totalRevenue: 15000,
  },
  {
    id: 'a-2',
    name: 'VoyageCo',
    status: 'APPROVED',
    offersCount: 10,
    bookingsCount: 3,
    conversionRate: 30,
    avgResponseHours: 6.1,
    totalRevenue: 10000,
  },
];

const mockManagers = [
  {
    id: 'm-1',
    firstName: 'Anna',
    lastName: 'Smith',
    bookingsVerified: 12,
    meetingsScheduled: 10,
    meetingsCompleted: 8,
    avgVerifyHours: 2.5,
  },
];

function createMockAdminService() {
  return {
    getOverviewAnalytics: jest.fn().mockResolvedValue(mockOverview),
    getAgencyAnalytics: jest.fn().mockResolvedValue(mockAgencies),
    getManagerAnalytics: jest.fn().mockResolvedValue(mockManagers),
  } as unknown as AdminService;
}

// ---------------------------------------------------------------------------
// Controller Tests
// ---------------------------------------------------------------------------

describe('AdminAnalyticsController', () => {
  let controller: AdminAnalyticsController;
  let adminService: jest.Mocked<
    Pick<AdminService, 'getOverviewAnalytics' | 'getAgencyAnalytics' | 'getManagerAnalytics'>
  >;

  const query = { from: '2026-02-01', to: '2026-02-28' };

  beforeEach(() => {
    const svc = createMockAdminService();
    adminService = svc as any;
    controller = new AdminAnalyticsController(svc);
  });

  describe('GET /admin/analytics/overview', () => {
    it('should return funnel, revenue, trends and response times', async () => {
      const result = await controller.getOverview(query);

      expect(result.success).toBe(true);
      expect(result.data!.funnel.travelRequests).toBe(50);
      expect(result.data!.funnel.completed).toBe(5);
      expect(result.data!.revenue.total).toBe(25000);
      expect(result.data!.trends).toHaveLength(2);
      expect(result.data!.responseTimes.avgOfferResponseHours).toBe(4.5);
      expect(adminService.getOverviewAnalytics).toHaveBeenCalledWith(query);
    });

    it('should pass date range to service', async () => {
      const customQuery = { from: '2026-01-01', to: '2026-01-31' };
      await controller.getOverview(customQuery);
      expect(adminService.getOverviewAnalytics).toHaveBeenCalledWith(customQuery);
    });

    it('should return fail() when service throws', async () => {
      (adminService.getOverviewAnalytics as jest.Mock).mockRejectedValue(
        new Error('DB connection lost'),
      );
      const result = await controller.getOverview(query);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to load overview');
    });

    it('should handle empty dataset (all zeros)', async () => {
      (adminService.getOverviewAnalytics as jest.Mock).mockResolvedValue(emptyOverview);
      const result = await controller.getOverview(query);

      expect(result.success).toBe(true);
      expect(result.data!.funnel.travelRequests).toBe(0);
      expect(result.data!.revenue.total).toBe(0);
      expect(result.data!.trends).toEqual([]);
      expect(result.data!.responseTimes.avgOfferResponseHours).toBeNull();
    });

    it('should work without date params (optional)', async () => {
      const result = await controller.getOverview({});
      expect(result.success).toBe(true);
      expect(adminService.getOverviewAnalytics).toHaveBeenCalledWith({});
    });
  });

  describe('GET /admin/analytics/agencies', () => {
    it('should return agency rankings sorted by revenue', async () => {
      const result = await controller.getAgencies(query);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data![0].name).toBe('TravelPro');
      expect(result.data![0].totalRevenue).toBe(15000);
      expect(result.data![0].conversionRate).toBe(40);
    });

    it('should return empty array when no approved agencies', async () => {
      (adminService.getAgencyAnalytics as jest.Mock).mockResolvedValue([]);
      const result = await controller.getAgencies(query);
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should handle agency with null avgResponseHours', async () => {
      (adminService.getAgencyAnalytics as jest.Mock).mockResolvedValue([
        { ...mockAgencies[0], avgResponseHours: null, offersCount: 0, conversionRate: 0 },
      ]);
      const result = await controller.getAgencies(query);
      expect(result.success).toBe(true);
      expect(result.data![0].avgResponseHours).toBeNull();
      expect(result.data![0].conversionRate).toBe(0);
    });

    it('should return fail() when service throws', async () => {
      (adminService.getAgencyAnalytics as jest.Mock).mockRejectedValue(new Error('timeout'));
      const result = await controller.getAgencies(query);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to load agency');
    });
  });

  describe('GET /admin/analytics/managers', () => {
    it('should return manager performance stats', async () => {
      const result = await controller.getManagers(query);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].firstName).toBe('Anna');
      expect(result.data![0].bookingsVerified).toBe(12);
    });

    it('should return empty array when no managers exist', async () => {
      (adminService.getManagerAnalytics as jest.Mock).mockResolvedValue([]);
      const result = await controller.getManagers(query);
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should handle manager with null avgVerifyHours and zero counts', async () => {
      (adminService.getManagerAnalytics as jest.Mock).mockResolvedValue([
        {
          id: 'm-1',
          firstName: 'Bob',
          lastName: null,
          bookingsVerified: 0,
          meetingsScheduled: 0,
          meetingsCompleted: 0,
          avgVerifyHours: null,
        },
      ]);
      const result = await controller.getManagers(query);
      expect(result.success).toBe(true);
      expect(result.data![0].avgVerifyHours).toBeNull();
      expect(result.data![0].bookingsVerified).toBe(0);
    });

    it('should return fail() when service throws', async () => {
      (adminService.getManagerAnalytics as jest.Mock).mockRejectedValue(new Error('query failed'));
      const result = await controller.getManagers(query);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to load manager');
    });
  });
});

// ---------------------------------------------------------------------------
// Service-level Defensive Data Pattern Tests
// ---------------------------------------------------------------------------

function mockPrisma() {
  const countFn = jest.fn().mockResolvedValue(0);
  const aggregateFn = jest.fn().mockResolvedValue({
    _sum: { totalPrice: null },
    _avg: { totalPrice: null },
    _count: 0,
  });
  const groupByFn = jest.fn().mockResolvedValue([]);
  const findManyFn = jest.fn().mockResolvedValue([]);
  const queryRawFn = jest.fn().mockResolvedValue([]);

  return {
    travelRequest: { count: countFn },
    booking: { count: countFn, aggregate: aggregateFn, groupBy: groupByFn },
    offer: { count: countFn },
    meeting: { count: countFn },
    agency: { findMany: findManyFn },
    user: { findMany: findManyFn },
    $queryRaw: queryRawFn,
    // expose for assertions
    _countFn: countFn,
    _aggregateFn: aggregateFn,
    _groupByFn: groupByFn,
    _findManyFn: findManyFn,
    _queryRawFn: queryRawFn,
  };
}

describe('AdminService — Defensive Data Pattern', () => {
  const query = { from: '2026-02-01', to: '2026-02-28' };

  function createService(prisma: ReturnType<typeof mockPrisma>) {
    return new AdminService(
      prisma as any, // PrismaService
      {} as any,     // BookingStateMachineService
      {} as any,     // MeetingService
      {} as any,     // MeetingProposalService
      { get: jest.fn(), set: jest.fn(), del: jest.fn() } as any, // CacheService
    );
  }

  describe('getOverviewAnalytics', () => {
    it('should never throw on empty database', async () => {
      const prisma = mockPrisma();
      const service = createService(prisma);

      const result = await service.getOverviewAnalytics(query);

      expect(result.funnel.travelRequests).toBe(0);
      expect(result.funnel.completed).toBe(0);
      expect(result.revenue.total).toBe(0);
      expect(result.revenue.average).toBe(0);
      expect(result.revenue.count).toBe(0);
      expect(result.revenue.byCurrency).toEqual([]);
      expect(result.trends).toEqual([]);
      expect(result.responseTimes.avgOfferResponseHours).toBeNull();
      expect(result.responseTimes.avgAgencyConfirmHours).toBeNull();
    });

    it('should degrade trends gracefully when raw SQL fails', async () => {
      const prisma = mockPrisma();
      prisma._queryRawFn.mockRejectedValue(new Error('relation does not exist'));
      const service = createService(prisma);

      const result = await service.getOverviewAnalytics(query);

      // Funnel still works (uses Prisma ORM, not raw SQL)
      expect(result.funnel).toBeDefined();
      expect(result.funnel.travelRequests).toBe(0);
      // Trends degrade to empty
      expect(result.trends).toEqual([]);
      // Response times also degrade to null
      expect(result.responseTimes.avgOfferResponseHours).toBeNull();
    });

    it('should degrade funnel when count queries fail', async () => {
      const prisma = mockPrisma();
      prisma.travelRequest.count = jest.fn().mockRejectedValue(new Error('timeout'));
      prisma.booking.count = jest.fn().mockRejectedValue(new Error('timeout'));
      const service = createService(prisma);

      const result = await service.getOverviewAnalytics(query);

      expect(result.funnel.travelRequests).toBe(0);
      expect(result.funnel.withBookings).toBe(0);
      // Revenue also fails (booking.aggregate uses same connection)
      expect(result.revenue.total).toBe(0);
    });

    it('should handle NaN from bad Decimal by returning 0', async () => {
      const prisma = mockPrisma();
      prisma._aggregateFn.mockResolvedValue({
        _sum: { totalPrice: 'not-a-number' },
        _avg: { totalPrice: undefined },
        _count: 0,
      });
      const service = createService(prisma);

      const result = await service.getOverviewAnalytics(query);

      expect(Number.isFinite(result.revenue.total)).toBe(true);
      expect(result.revenue.total).toBe(0);
      expect(result.revenue.average).toBe(0);
    });

    it('should default to last 30 days when dates are missing', async () => {
      const prisma = mockPrisma();
      const service = createService(prisma);

      // No dates provided
      const result = await service.getOverviewAnalytics({});

      expect(result).toBeDefined();
      expect(result.funnel.travelRequests).toBe(0);
    });

    it('should default to last 30 days when dates are invalid', async () => {
      const prisma = mockPrisma();
      const service = createService(prisma);

      const result = await service.getOverviewAnalytics({
        from: 'not-a-date',
        to: 'also-bad',
      });

      expect(result).toBeDefined();
      expect(result.funnel.travelRequests).toBe(0);
    });
  });

  describe('getAgencyAnalytics', () => {
    it('should return [] when no approved agencies', async () => {
      const prisma = mockPrisma();
      const service = createService(prisma);

      const result = await service.getAgencyAnalytics(query);
      expect(result).toEqual([]);
    });

    it('should return [] when agency list query fails', async () => {
      const prisma = mockPrisma();
      prisma.agency.findMany = jest.fn().mockRejectedValue(new Error('connection reset'));
      const service = createService(prisma);

      const result = await service.getAgencyAnalytics(query);
      expect(result).toEqual([]);
    });

    it('should return zero-value row when per-agency counts fail', async () => {
      const prisma = mockPrisma();
      prisma.agency.findMany = jest.fn().mockResolvedValue([
        { id: 'a-1', name: 'TestAgency', status: 'APPROVED' },
      ]);
      // All count/aggregate calls fail
      prisma.offer.count = jest.fn().mockRejectedValue(new Error('timeout'));
      prisma.booking.count = jest.fn().mockRejectedValue(new Error('timeout'));
      prisma._aggregateFn.mockRejectedValue(new Error('timeout'));
      const service = createService(prisma);

      const result = await service.getAgencyAnalytics(query);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('TestAgency');
      expect(result[0].offersCount).toBe(0);
      expect(result[0].bookingsCount).toBe(0);
      expect(result[0].conversionRate).toBe(0);
      expect(result[0].totalRevenue).toBe(0);
      expect(result[0].avgResponseHours).toBeNull();
    });

    it('should handle division by zero in conversion rate', async () => {
      const prisma = mockPrisma();
      prisma.agency.findMany = jest.fn().mockResolvedValue([
        { id: 'a-1', name: 'NewAgency', status: 'APPROVED' },
      ]);
      // offersCount=0, bookingsCount=0 → conversionRate should be 0
      const service = createService(prisma);

      const result = await service.getAgencyAnalytics(query);

      expect(result[0].conversionRate).toBe(0);
      expect(Number.isFinite(result[0].conversionRate)).toBe(true);
    });
  });

  describe('getManagerAnalytics', () => {
    it('should return [] when no active managers', async () => {
      const prisma = mockPrisma();
      const service = createService(prisma);

      const result = await service.getManagerAnalytics(query);
      expect(result).toEqual([]);
    });

    it('should return [] when manager list query fails', async () => {
      const prisma = mockPrisma();
      prisma.user.findMany = jest.fn().mockRejectedValue(new Error('connection reset'));
      const service = createService(prisma);

      const result = await service.getManagerAnalytics(query);
      expect(result).toEqual([]);
    });

    it('should return zero-value row when per-manager counts fail', async () => {
      const prisma = mockPrisma();
      prisma.user.findMany = jest.fn().mockResolvedValue([
        { id: 'm-1', firstName: 'Jane', lastName: null },
      ]);
      prisma.booking.count = jest.fn().mockRejectedValue(new Error('timeout'));
      prisma.meeting.count = jest.fn().mockRejectedValue(new Error('timeout'));
      const service = createService(prisma);

      const result = await service.getManagerAnalytics(query);

      expect(result).toHaveLength(1);
      expect(result[0].firstName).toBe('Jane');
      expect(result[0].bookingsVerified).toBe(0);
      expect(result[0].meetingsScheduled).toBe(0);
      expect(result[0].meetingsCompleted).toBe(0);
      expect(result[0].avgVerifyHours).toBeNull();
    });

    it('all numeric fields should be finite numbers, never NaN', async () => {
      const prisma = mockPrisma();
      prisma.user.findMany = jest.fn().mockResolvedValue([
        { id: 'm-1', firstName: 'Test', lastName: 'User' },
      ]);
      const service = createService(prisma);

      const result = await service.getManagerAnalytics(query);

      for (const mgr of result) {
        expect(Number.isFinite(mgr.bookingsVerified)).toBe(true);
        expect(Number.isFinite(mgr.meetingsScheduled)).toBe(true);
        expect(Number.isFinite(mgr.meetingsCompleted)).toBe(true);
        // avgVerifyHours is null or finite
        if (mgr.avgVerifyHours !== null) {
          expect(Number.isFinite(mgr.avgVerifyHours)).toBe(true);
        }
      }
    });
  });
});

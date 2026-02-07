import { RfqDistributionService } from '../rfq-distribution.service';
import { AgencyMatchingService } from '../agency-matching.service';
import { RfqNotificationBuilder } from '../rfq-notification.builder';
import { PrismaService } from '../../../../infra/prisma/prisma.service';
import { Queue } from 'bullmq';
import { TravelRequestStatus } from '@prisma/client';
import { AgencyMatchResult, RfqNotificationPayload } from '../../types';

function createMockRequest() {
  return {
    id: 'req-001',
    userId: 'user-001',
    status: TravelRequestStatus.READY,
    destination: 'Dubai',
    departureCity: 'Yerevan',
    departureDate: new Date('2026-03-15'),
    returnDate: new Date('2026-03-22'),
    tripType: 'PACKAGE' as const,
    adults: 2,
    children: 0,
    childrenAges: [],
    infants: 0,
    budgetMin: null,
    budgetMax: 2000,
    currency: 'USD' as const,
    preferences: [],
    notes: null,
    rawText: 'test',
    language: 'EN' as const,
    expiresAt: new Date('2026-03-29'),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function createMockAgencies(): AgencyMatchResult[] {
  return [
    {
      agencyId: 'agency-001',
      agencyName: 'Ararat Travel',
      telegramChatId: BigInt(123456789),
      matchScore: 5.5,
      matchReasons: ['region:Dubai', 'specialization:PACKAGE'],
    },
    {
      agencyId: 'agency-002',
      agencyName: 'SkyBridge Tours',
      telegramChatId: BigInt(987654321),
      matchScore: 3.2,
      matchReasons: ['region:Dubai'],
    },
  ];
}

function createMockNotification(): RfqNotificationPayload {
  return {
    travelRequestId: 'req-001',
    destination: 'Dubai',
    departureCity: 'Yerevan',
    departureDate: '2026-03-15',
    returnDate: '2026-03-22',
    tripType: 'PACKAGE',
    adults: 2,
    children: 0,
    childrenAges: [],
    infants: 0,
    budgetRange: 'up to 2000 USD',
    currency: 'USD',
    preferences: [],
    notes: null,
    summaryText: 'test summary',
    language: 'EN',
  };
}

describe('RfqDistributionService', () => {
  let service: RfqDistributionService;
  let prisma: {
    travelRequest: { findUniqueOrThrow: jest.Mock; update: jest.Mock };
    rfqDistribution: { count: jest.Mock; create: jest.Mock };
    $transaction: jest.Mock;
  };
  let matching: jest.Mocked<AgencyMatchingService>;
  let notificationBuilder: jest.Mocked<RfqNotificationBuilder>;
  let queue: { addBulk: jest.Mock };

  beforeEach(() => {
    prisma = {
      travelRequest: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(createMockRequest()),
        update: jest.fn().mockResolvedValue(undefined),
      },
      rfqDistribution: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        // Simulate transaction by passing prisma itself as tx
        const tx = {
          rfqDistribution: {
            create: jest
              .fn()
              .mockResolvedValueOnce({ id: 'dist-001' })
              .mockResolvedValueOnce({ id: 'dist-002' }),
          },
          travelRequest: {
            update: jest.fn().mockResolvedValue(undefined),
          },
        };
        return fn(tx);
      }),
    };

    matching = {
      match: jest.fn().mockResolvedValue(createMockAgencies()),
    } as unknown as jest.Mocked<AgencyMatchingService>;

    notificationBuilder = {
      build: jest.fn().mockReturnValue(createMockNotification()),
    } as unknown as jest.Mocked<RfqNotificationBuilder>;

    queue = {
      addBulk: jest.fn().mockResolvedValue(undefined),
    };

    service = new RfqDistributionService(
      prisma as unknown as PrismaService,
      matching,
      notificationBuilder,
      queue as unknown as Queue,
    );
  });

  it('should distribute to matched agencies and enqueue jobs', async () => {
    const result = await service.distribute('req-001');

    // Should check idempotency first
    expect(prisma.rfqDistribution.count).toHaveBeenCalledWith({
      where: { travelRequestId: 'req-001' },
    });

    // Should load request
    expect(prisma.travelRequest.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'req-001' },
    });

    // Should match agencies
    expect(matching.match).toHaveBeenCalled();

    // Should create distributions in transaction
    expect(prisma.$transaction).toHaveBeenCalled();

    // Should enqueue delivery jobs
    expect(queue.addBulk).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          data: expect.objectContaining({
            distributionId: 'dist-001',
            travelRequestId: 'req-001',
            agencyId: 'agency-001',
          }),
        }),
      ]),
    );

    // Should return correct result
    expect(result.totalAgenciesMatched).toBe(2);
    expect(result.distributionIds).toEqual(['dist-001', 'dist-002']);
    expect(result.agencyIds).toEqual(['agency-001', 'agency-002']);
  });

  it('should skip distribution if already distributed (idempotency)', async () => {
    prisma.rfqDistribution.count.mockResolvedValue(3);

    const result = await service.distribute('req-001');

    // Should NOT load request or match agencies
    expect(prisma.travelRequest.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(matching.match).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(queue.addBulk).not.toHaveBeenCalled();

    // Should return empty result
    expect(result.totalAgenciesMatched).toBe(0);
    expect(result.distributionIds).toEqual([]);
  });

  it('should return empty result when no agencies match', async () => {
    matching.match.mockResolvedValue([]);

    const result = await service.distribute('req-001');

    // Should NOT create distributions or enqueue
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(queue.addBulk).not.toHaveBeenCalled();

    expect(result.totalAgenciesMatched).toBe(0);
    expect(result.distributionIds).toEqual([]);
  });

  it('should propagate errors from prisma transaction', async () => {
    prisma.$transaction.mockRejectedValue(new Error('DB connection lost'));

    await expect(service.distribute('req-001')).rejects.toThrow(
      'DB connection lost',
    );
  });
});

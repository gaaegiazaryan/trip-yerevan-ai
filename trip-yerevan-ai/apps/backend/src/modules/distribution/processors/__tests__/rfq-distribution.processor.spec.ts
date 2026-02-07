import { Job } from 'bullmq';
import { RfqDistributionProcessor } from '../rfq-distribution.processor';
import { RfqDistributionService } from '../../services/rfq-distribution.service';
import { RfqNotificationBuilder } from '../../services/rfq-notification.builder';
import { TelegramService } from '../../../telegram/telegram.service';
import { PrismaService } from '../../../../infra/prisma/prisma.service';
import { RfqJobPayload, RfqNotificationPayload } from '../../types';

function createMockNotification(
  overrides: Partial<RfqNotificationPayload> = {},
): RfqNotificationPayload {
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
    preferences: ['all_inclusive'],
    notes: null,
    summaryText: 'test summary',
    language: 'EN',
    ...overrides,
  };
}

function createMockJob(
  overrides: Partial<RfqJobPayload> = {},
): Job<RfqJobPayload> {
  return {
    data: {
      distributionId: 'dist-001',
      travelRequestId: 'req-001',
      agencyId: 'agency-001',
      agencyTelegramChatId: '123456789',
      notification: createMockNotification(),
      ...overrides,
    },
  } as Job<RfqJobPayload>;
}

describe('RfqDistributionProcessor', () => {
  let processor: RfqDistributionProcessor;
  let distribution: jest.Mocked<RfqDistributionService>;
  let telegram: jest.Mocked<TelegramService>;
  let notificationBuilder: jest.Mocked<RfqNotificationBuilder>;
  let prisma: { rfqDistribution: { findUnique: jest.Mock }; travelRequest: { findUnique: jest.Mock } };

  beforeEach(() => {
    distribution = {
      markDelivered: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<RfqDistributionService>;

    telegram = {
      sendRfqToAgency: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TelegramService>;

    notificationBuilder = {
      buildTelegramMessage: jest.fn().mockReturnValue('*New Travel Request*\n...'),
    } as unknown as jest.Mocked<RfqNotificationBuilder>;

    prisma = {
      rfqDistribution: {
        findUnique: jest.fn().mockResolvedValue({ deliveryStatus: 'PENDING' }),
      },
      travelRequest: {
        findUnique: jest.fn().mockResolvedValue({
          expiresAt: new Date('2026-03-29'),
        }),
      },
    };

    processor = new RfqDistributionProcessor(
      distribution,
      telegram,
      notificationBuilder,
      prisma as unknown as PrismaService,
    );
  });

  it('should deliver RFQ successfully to agency with telegramChatId', async () => {
    const job = createMockJob();

    await processor.process(job);

    // Should build Telegram message
    expect(notificationBuilder.buildTelegramMessage).toHaveBeenCalledWith(
      job.data.notification,
      new Date('2026-03-29'),
    );

    // Should send via Telegram with correct chat ID and actions
    expect(telegram.sendRfqToAgency).toHaveBeenCalledWith(
      123456789,
      '*New Travel Request*\n...',
      [
        { label: '\ud83d\udce9 Submit Offer', callbackData: 'rfq:offer:req-001' },
        { label: '\u274c Reject RFQ', callbackData: 'rfq:reject:req-001' },
      ],
    );

    // Should mark as delivered
    expect(distribution.markDelivered).toHaveBeenCalledWith('dist-001');
    expect(distribution.markFailed).not.toHaveBeenCalled();
  });

  it('should mark FAILED when agency has no telegramChatId', async () => {
    const job = createMockJob({ agencyTelegramChatId: null });

    await processor.process(job);

    // Should NOT attempt to send
    expect(telegram.sendRfqToAgency).not.toHaveBeenCalled();

    // Should mark as failed with descriptive reason
    expect(distribution.markFailed).toHaveBeenCalledWith(
      'dist-001',
      expect.stringContaining('no Telegram chat ID'),
    );
    expect(distribution.markDelivered).not.toHaveBeenCalled();
  });

  it('should mark FAILED when Telegram send throws non-transient error', async () => {
    telegram.sendRfqToAgency.mockRejectedValue(
      new Error('Chat not found'),
    );

    const job = createMockJob();

    await processor.process(job);

    expect(distribution.markFailed).toHaveBeenCalledWith(
      'dist-001',
      'Chat not found',
    );
    expect(distribution.markDelivered).not.toHaveBeenCalled();
  });

  it('should rethrow transient errors for BullMQ retry', async () => {
    telegram.sendRfqToAgency.mockRejectedValue(
      new Error('ECONNREFUSED'),
    );

    const job = createMockJob();

    await expect(processor.process(job)).rejects.toThrow('ECONNREFUSED');

    // Should still mark as failed (will be retried by BullMQ)
    expect(distribution.markFailed).toHaveBeenCalledWith(
      'dist-001',
      'ECONNREFUSED',
    );
  });

  it('should rethrow on Telegram 429 rate limit', async () => {
    telegram.sendRfqToAgency.mockRejectedValue(
      new Error('429: Too Many Requests'),
    );

    const job = createMockJob();

    await expect(processor.process(job)).rejects.toThrow('Too Many Requests');
    expect(distribution.markFailed).toHaveBeenCalled();
  });

  it('should skip delivery if already DELIVERED (idempotency)', async () => {
    prisma.rfqDistribution.findUnique.mockResolvedValue({
      deliveryStatus: 'DELIVERED',
    });

    const job = createMockJob();

    await processor.process(job);

    // Should NOT send or update anything
    expect(telegram.sendRfqToAgency).not.toHaveBeenCalled();
    expect(distribution.markDelivered).not.toHaveBeenCalled();
    expect(distribution.markFailed).not.toHaveBeenCalled();
  });

  it('should handle missing TravelRequest gracefully (null expiresAt)', async () => {
    prisma.travelRequest.findUnique.mockResolvedValue(null);

    const job = createMockJob();

    await processor.process(job);

    // Should still deliver with null expiresAt
    expect(notificationBuilder.buildTelegramMessage).toHaveBeenCalledWith(
      job.data.notification,
      null,
    );
    expect(telegram.sendRfqToAgency).toHaveBeenCalled();
    expect(distribution.markDelivered).toHaveBeenCalled();
  });
});

describe('RfqNotificationBuilder.buildTelegramMessage', () => {
  let builder: RfqNotificationBuilder;

  beforeEach(() => {
    builder = new RfqNotificationBuilder();
  });

  it('should include all required fields in message', () => {
    const notification = createMockNotification();
    const message = builder.buildTelegramMessage(
      notification,
      new Date('2026-03-29'),
    );

    expect(message).toContain('New Travel Request');
    expect(message).toContain('Dubai');
    expect(message).toContain('Yerevan');
    expect(message).toContain('2026-03-15');
    expect(message).toContain('2026-03-22');
    expect(message).toContain('2 adults');
    expect(message).toContain('up to 2000 USD');
    expect(message).toContain('all\\_inclusive');
    expect(message).toContain('req-001');
    expect(message).toContain('2026-03-29');
  });

  it('should handle one-way trip (no return date)', () => {
    const notification = createMockNotification({ returnDate: null });
    const message = builder.buildTelegramMessage(notification, null);

    expect(message).toContain('*Departure:*');
    expect(message).not.toContain('*Dates:*');
  });

  it('should include children and infants when present', () => {
    const notification = createMockNotification({
      children: 2,
      childrenAges: [5, 8],
      infants: 1,
    });
    const message = builder.buildTelegramMessage(notification, null);

    expect(message).toContain('2 children (ages: 5, 8)');
    expect(message).toContain('1 infant');
  });

  it('should omit optional fields when null', () => {
    const notification = createMockNotification({
      budgetRange: null,
      notes: null,
      preferences: [],
      tripType: null,
    });
    const message = builder.buildTelegramMessage(notification, null);

    expect(message).not.toContain('Budget');
    expect(message).not.toContain('Notes');
    expect(message).not.toContain('Preferences');
    expect(message).not.toContain('Trip type');
  });

  it('should format trip type with proper casing', () => {
    const notification = createMockNotification({ tripType: 'FLIGHT_ONLY' });
    const message = builder.buildTelegramMessage(notification, null);

    expect(message).toContain('Flight only');
  });
});

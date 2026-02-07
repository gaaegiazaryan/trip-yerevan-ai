import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { RFQ_DISTRIBUTION_QUEUE, RfqJobPayload } from '../types';
import { RfqDistributionService } from '../services/rfq-distribution.service';
import { RfqNotificationBuilder } from '../services/rfq-notification.builder';
import { TelegramService } from '../../telegram/telegram.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';

@Processor(RFQ_DISTRIBUTION_QUEUE)
export class RfqDistributionProcessor extends WorkerHost {
  private readonly logger = new Logger(RfqDistributionProcessor.name);

  constructor(
    private readonly distribution: RfqDistributionService,
    private readonly telegram: TelegramService,
    private readonly notificationBuilder: RfqNotificationBuilder,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  /**
   * Processes a single agency RFQ delivery job.
   *
   * 1. Validates agency has a Telegram chat ID
   * 2. Loads TravelRequest for expiration date
   * 3. Builds formatted Telegram message with inline actions
   * 4. Sends via TelegramService
   * 5. Updates distribution status
   *
   * Idempotent: if distribution is already DELIVERED, skips delivery.
   * Failures do NOT affect other agencies — each job is independent.
   */
  async process(job: Job<RfqJobPayload>): Promise<void> {
    const {
      distributionId,
      travelRequestId,
      agencyId,
      agencyTelegramChatId,
      notification,
    } = job.data;

    this.logger.debug(
      `Processing delivery: distribution=${distributionId}, ` +
        `agency=${agencyId}, request=${travelRequestId}`,
    );

    try {
      // Idempotency check — skip if already delivered
      if (await this.isAlreadyDelivered(distributionId)) {
        this.logger.log(
          `Distribution ${distributionId} already delivered — skipping`,
        );
        return;
      }

      // Validate chat ID
      if (!agencyTelegramChatId) {
        await this.distribution.markFailed(
          distributionId,
          `Agency ${agencyId} has no Telegram chat ID — cannot deliver notification`,
        );
        this.logger.warn(
          `Agency ${agencyId} has no telegramChatId — marked distribution ${distributionId} as FAILED`,
        );
        return;
      }

      // Load TravelRequest for expiration date
      const travelRequest = await this.prisma.travelRequest.findUnique({
        where: { id: travelRequestId },
        select: { expiresAt: true },
      });

      // Build message
      const messageText = this.notificationBuilder.buildTelegramMessage(
        notification,
        travelRequest?.expiresAt ?? null,
      );

      // Build inline keyboard actions
      const actions = [
        {
          label: '\ud83d\udce9 Submit Offer',
          callbackData: `rfq:offer:${travelRequestId}`,
        },
        {
          label: '\u274c Reject RFQ',
          callbackData: `rfq:reject:${travelRequestId}`,
        },
      ];

      // Send via Telegram
      await this.telegram.sendRfqToAgency(
        Number(agencyTelegramChatId),
        messageText,
        actions,
      );

      // Mark as delivered
      await this.distribution.markDelivered(distributionId);

      this.logger.log(
        `Delivered RFQ ${travelRequestId} to agency ${agencyId} ` +
          `(chat=${agencyTelegramChatId})`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      // Mark as failed
      await this.distribution.markFailed(distributionId, reason);

      this.logger.error(
        `Failed to deliver RFQ ${travelRequestId} to agency ${agencyId}: ${reason}`,
      );

      // Rethrow for BullMQ retry on transient errors
      if (this.isTransientError(error)) {
        throw error;
      }
    }
  }

  /**
   * Checks if this distribution has already been delivered (idempotency).
   * Prevents duplicate sends on job retry after status update succeeded
   * but before the job was acknowledged.
   */
  private async isAlreadyDelivered(distributionId: string): Promise<boolean> {
    const record = await this.prisma.rfqDistribution.findUnique({
      where: { id: distributionId },
      select: { deliveryStatus: true },
    });
    return record?.deliveryStatus === 'DELIVERED';
  }

  private isTransientError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message;
      // Network/timeout errors are retryable
      if (
        ['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND'].some(
          (code) => message.includes(code),
        )
      ) {
        return true;
      }
      // Telegram API 429 (rate limit) and 5xx are retryable
      if (message.includes('429') || message.includes('Too Many Requests')) {
        return true;
      }
      if (/5\d{2}/.test(message)) {
        return true;
      }
    }
    return false;
  }
}

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { RFQ_DISTRIBUTION_QUEUE, RfqJobPayload } from '../types';
import { RfqDistributionService } from '../services/rfq-distribution.service';

@Processor(RFQ_DISTRIBUTION_QUEUE)
export class RfqDistributionProcessor extends WorkerHost {
  private readonly logger = new Logger(RfqDistributionProcessor.name);

  constructor(
    private readonly distribution: RfqDistributionService,
  ) {
    super();
  }

  /**
   * Processes a single agency notification delivery.
   *
   * Current implementation simulates delivery (no Telegram API).
   * When Telegram is wired, this will call TelegramService.sendRfqNotification().
   *
   * On success: marks distribution as DELIVERED.
   * On failure: marks distribution as FAILED with reason.
   * Failures do NOT affect other agencies — each job is independent.
   */
  async process(job: Job<RfqJobPayload>): Promise<void> {
    const { distributionId, travelRequestId, agencyId, agencyTelegramChatId, notification } =
      job.data;

    this.logger.debug(
      `Processing delivery: distribution=${distributionId}, ` +
        `agency=${agencyId}, request=${travelRequestId}`,
    );

    try {
      // Simulate notification delivery
      // TODO: Replace with actual Telegram notification:
      //   await this.telegram.sendRfqNotification(agencyTelegramChatId, notification);
      await this.simulateDelivery(agencyId, agencyTelegramChatId);

      // Mark as delivered
      await this.distribution.markDelivered(distributionId);

      this.logger.log(
        `Delivered RFQ ${travelRequestId} to agency ${agencyId}`,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      // Mark as failed — do NOT rethrow to prevent retry for known failures
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
   * Simulates notification delivery. Succeeds for agencies with Telegram chat IDs.
   * Fails with descriptive reason for agencies without chat IDs.
   */
  private async simulateDelivery(
    agencyId: string,
    telegramChatId: bigint | null,
  ): Promise<void> {
    // Simulate network latency
    await new Promise((resolve) => setTimeout(resolve, 50));

    if (!telegramChatId) {
      throw new Error(
        `Agency ${agencyId} has no Telegram chat ID — cannot deliver notification`,
      );
    }

    // In production this would be:
    // await this.telegram.sendMessage(telegramChatId, formattedMessage);
    this.logger.debug(
      `[SIMULATED] Sent RFQ notification to Telegram chat ${telegramChatId}`,
    );
  }

  private isTransientError(error: unknown): boolean {
    if (error instanceof Error) {
      // Network/timeout errors are retryable
      return ['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET'].some((code) =>
        error.message.includes(code),
      );
    }
    return false;
  }
}

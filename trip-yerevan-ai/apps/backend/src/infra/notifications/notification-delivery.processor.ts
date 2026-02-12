import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationChannel, NotificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TemplateResolverService } from './template-resolver.service';
import {
  NotificationChannelProvider,
  SendResult,
} from './notification-channel.provider';
import {
  NOTIFICATION_QUEUE,
  NOTIFICATION_CONCURRENCY,
  MAX_DELIVERY_ATTEMPTS,
  BACKOFF_DELAYS_SEC,
} from './notification.constants';

export interface DeliveryJobData {
  notificationId: string;
}

@Processor(NOTIFICATION_QUEUE, { concurrency: NOTIFICATION_CONCURRENCY })
@Injectable()
export class NotificationDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationDeliveryProcessor.name);
  private readonly channelProviders: Map<string, NotificationChannelProvider>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly templateResolver: TemplateResolverService,
    providers: NotificationChannelProvider[],
  ) {
    super();
    this.channelProviders = new Map(
      providers.map((p) => [p.channel, p]),
    );
  }

  // ── Worker lifecycle events ─────────────────────────────────

  @OnWorkerEvent('ready')
  onReady() {
    this.logger.log(
      `Notification worker started — queue="${NOTIFICATION_QUEUE}", concurrency=${NOTIFICATION_CONCURRENCY}`,
    );
  }

  @OnWorkerEvent('active')
  onActive(job: Job<DeliveryJobData>) {
    this.logger.debug(
      `[delivery] Job active: jobId=${job.id}, notificationId=${job.data.notificationId}`,
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job<DeliveryJobData>) {
    this.logger.log(
      `[delivery] Job completed: jobId=${job.id}, notificationId=${job.data.notificationId}`,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<DeliveryJobData> | undefined, error: Error) {
    this.logger.error(
      `[delivery] Job failed: jobId=${job?.id ?? 'unknown'}, notificationId=${job?.data?.notificationId ?? 'unknown'}, error=${error.message}`,
    );
  }

  @OnWorkerEvent('error')
  onError(error: Error) {
    this.logger.error(`[delivery] Worker error: ${error.message}`, error.stack);
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string) {
    this.logger.warn(`[delivery] Job stalled: jobId=${jobId}`);
  }

  async process(job: Job<DeliveryJobData>): Promise<void> {
    const { notificationId } = job.data;

    // 1. Load notification log
    const log = await this.prisma.notificationLog.findUnique({
      where: { id: notificationId },
    });

    if (!log) {
      this.logger.warn(
        `[delivery] Notification ${notificationId} not found, skipping`,
      );
      return;
    }

    // 2. Idempotent: skip if already sent
    if (log.status === NotificationStatus.SENT) {
      this.logger.debug(
        `[delivery] Notification ${notificationId} already SENT, skipping`,
      );
      return;
    }

    // 3. Check max attempts
    if (log.attemptCount >= MAX_DELIVERY_ATTEMPTS) {
      this.logger.warn(
        `[delivery] Notification ${notificationId} exceeded max attempts (${MAX_DELIVERY_ATTEMPTS}), marking permanently FAILED`,
      );
      await this.markFailed(
        notificationId,
        `Exceeded max delivery attempts (${MAX_DELIVERY_ATTEMPTS})`,
        log.attemptCount,
      );
      return;
    }

    // 4. Increment attempt counter
    const currentAttempt = log.attemptCount + 1;
    await this.prisma.notificationLog.update({
      where: { id: notificationId },
      data: {
        attemptCount: currentAttempt,
        lastAttemptAt: new Date(),
      },
    });

    // 5. Resolve and render template (DB-first, code-fallback)
    const variables = (log.payload ?? {}) as Record<string, string | number>;
    let text: string;
    let buttons: { label: string; callbackData: string }[] | undefined;
    try {
      const resolved = await this.templateResolver.resolve(
        log.templateKey,
        log.channel as NotificationChannel,
        variables,
      );
      text = resolved.rendered.text;
      buttons = resolved.rendered.buttons;
    } catch (error) {
      // Template errors are permanent — no point retrying
      await this.markFailed(
        notificationId,
        `Template render failed: ${error instanceof Error ? error.message : error}`,
        currentAttempt,
      );
      this.logger.error(
        `[delivery] Template render failed for ${notificationId}: ${error}`,
      );
      return;
    }

    // 6. Resolve channel provider
    const provider = this.channelProviders.get(log.channel);
    if (!provider) {
      await this.markFailed(
        notificationId,
        `No provider for channel "${log.channel}"`,
        currentAttempt,
      );
      return;
    }

    // 7. Send
    const result: SendResult = await provider.send(
      log.recipientChatId,
      text,
      buttons,
    );

    this.logger.log(
      `[delivery] notificationId=${notificationId}, attempt=${currentAttempt}, success=${result.success}, permanent=${result.permanent ?? false}`,
    );

    // 8. Handle result
    if (result.success) {
      await this.prisma.notificationLog.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.SENT,
          sentAt: new Date(),
          providerMessageId: result.providerMessageId ?? null,
          errorMessage: null,
          nextRetryAt: null,
        },
      });
      return;
    }

    // 9. Failure handling
    if (result.permanent) {
      // Permanent error — do NOT retry
      await this.markFailed(
        notificationId,
        `Permanent: ${result.errorMessage}`,
        currentAttempt,
      );
      return;
    }

    // Transient error — compute next retry time and throw to trigger BullMQ retry
    const delayIdx = Math.min(currentAttempt - 1, BACKOFF_DELAYS_SEC.length - 1);
    const delaySec = BACKOFF_DELAYS_SEC[delayIdx];
    // Add jitter: ±20%
    const jitter = delaySec * 0.2 * (Math.random() * 2 - 1);
    const actualDelaySec = Math.max(1, Math.round(delaySec + jitter));
    const nextRetryAt = new Date(Date.now() + actualDelaySec * 1000);

    await this.prisma.notificationLog.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.FAILED,
        errorMessage: result.errorMessage ?? 'Unknown transient error',
        nextRetryAt,
      },
    });

    // Throw to trigger BullMQ retry with the computed delay
    throw new Error(
      `Transient failure for notification ${notificationId}: ${result.errorMessage}. Retry in ${actualDelaySec}s`,
    );
  }

  private async markFailed(
    notificationId: string,
    errorMessage: string,
    attemptCount: number,
  ): Promise<void> {
    await this.prisma.notificationLog.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.FAILED,
        errorMessage,
        attemptCount,
        nextRetryAt: null, // No more automatic retries
        lastAttemptAt: new Date(),
      },
    });
  }
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'node:crypto';
import {
  NotificationChannel,
  NotificationStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationTemplateEngine } from './notification-template.engine';
import { TemplateResolverService } from './template-resolver.service';
import { NotificationPreferenceResolver } from './notification-preference.resolver';
import { BOOKING_TEMPLATES } from './templates';
import {
  NOTIFICATION_QUEUE,
  NOTIFICATION_DELIVERY_JOB,
} from './notification.constants';

export interface SendNotificationRequest {
  eventName: string;
  recipientId: string;
  recipientChatId: number;
  channel: NotificationChannel;
  templateKey: string;
  variables: Record<string, string | number>;
  /** Role of the recipient — used for preference resolution. Defaults to TRAVELER if omitted. */
  recipientRole?: UserRole;
}

export interface EnqueueResult {
  notificationId: string;
  deduplicated: boolean;
  skipped?: boolean;
}

@Injectable()
export class NotificationService implements OnModuleInit {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly templateEngine: NotificationTemplateEngine,
    private readonly templateResolver: TemplateResolverService,
    private readonly preferenceResolver: NotificationPreferenceResolver,
    @InjectQueue(NOTIFICATION_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.templateEngine.registerAll(BOOKING_TEMPLATES);
  }

  /**
   * Enqueue a notification for async delivery via BullMQ.
   *
   * - Computes an idempotencyKey from request fields
   * - If a log with that key already exists, returns it (no duplicate job)
   * - Otherwise creates a PENDING log and enqueues a delivery job
   */
  async send(request: SendNotificationRequest): Promise<EnqueueResult> {
    const {
      eventName,
      recipientId,
      recipientChatId,
      channel,
      templateKey,
      variables,
      recipientRole,
    } = request;

    const idempotencyKey = this.computeIdempotencyKey(
      eventName,
      recipientId,
      channel,
      templateKey,
      variables,
    );

    // Idempotency check
    const existing = await this.prisma.notificationLog.findUnique({
      where: { idempotencyKey },
      select: { id: true, status: true },
    });

    if (existing) {
      this.logger.debug(
        `[notification] Deduplicated: idempotencyKey=${idempotencyKey.slice(0, 12)}..., status=${existing.status}`,
      );
      return { notificationId: existing.id, deduplicated: true };
    }

    // Check notification preferences
    const role = recipientRole ?? UserRole.TRAVELER;
    const pref = await this.preferenceResolver.isChannelEnabled(
      recipientId,
      role,
      templateKey,
      channel,
    );

    if (!pref.enabled) {
      // Create SKIPPED log for audit trail
      const log = await this.prisma.notificationLog.create({
        data: {
          eventName,
          recipientId,
          recipientChatId,
          channel,
          templateKey,
          payload: variables as unknown as Prisma.InputJsonValue,
          status: NotificationStatus.SKIPPED,
          idempotencyKey,
          attemptCount: 0,
          skipReason: pref.reason,
        },
      });

      this.logger.log(
        `[notification] Skipped: id=${log.id}, templateKey=${templateKey}, recipientId=${recipientId}, reason=${pref.reason}`,
      );

      return { notificationId: log.id, deduplicated: false, skipped: true };
    }

    // Resolve template to capture version + snapshot at enqueue time
    let templateVersion: string | null = null;
    let templateSnapshot: string | null = null;
    let policyVersion: string | null = null;
    try {
      const resolved = await this.templateResolver.resolve(
        templateKey,
        channel,
        variables,
      );
      templateVersion = resolved.version;
      templateSnapshot = resolved.snapshot;
      policyVersion = resolved.policyVersion;
    } catch {
      // Template resolution failure at enqueue is non-fatal.
      // The processor will fail at render time and mark FAILED.
      this.logger.warn(
        `[notification] Template resolution failed at enqueue for "${templateKey}", will fail at delivery`,
      );
    }

    // Create PENDING log
    const log = await this.prisma.notificationLog.create({
      data: {
        eventName,
        recipientId,
        recipientChatId,
        channel,
        templateKey,
        payload: variables as unknown as Prisma.InputJsonValue,
        status: NotificationStatus.PENDING,
        idempotencyKey,
        attemptCount: 0,
        templateVersion,
        templateSnapshot,
        policyVersion,
      },
    });

    // Enqueue BullMQ job
    await this.queue.add(
      NOTIFICATION_DELIVERY_JOB,
      { notificationId: log.id },
      {
        jobId: `notif-${log.id}`,
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );

    this.logger.log(
      `[notification] Enqueued: id=${log.id}, templateKey=${templateKey}, recipientId=${recipientId}`,
    );

    return { notificationId: log.id, deduplicated: false };
  }

  /**
   * Enqueue multiple notifications. Each one is individually idempotent.
   */
  async sendAll(requests: SendNotificationRequest[]): Promise<EnqueueResult[]> {
    const results: EnqueueResult[] = [];
    for (const req of requests) {
      try {
        const result = await this.send(req);
        results.push(result);
      } catch (err) {
        this.logger.error(
          `[notification] Failed to enqueue notification: ${err}`,
          err instanceof Error ? err.stack : undefined,
        );
      }
    }
    return results;
  }

  /**
   * Requeue a specific notification for retry (admin operation).
   * Only requeues if status is FAILED.
   */
  async requeue(notificationId: string): Promise<boolean> {
    const log = await this.prisma.notificationLog.findUnique({
      where: { id: notificationId },
      select: { id: true, status: true },
    });

    if (!log) return false;
    if (log.status === NotificationStatus.SENT) return false;

    // Reset to PENDING for re-delivery
    await this.prisma.notificationLog.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.PENDING,
        errorMessage: null,
        nextRetryAt: null,
      },
    });

    await this.queue.add(
      NOTIFICATION_DELIVERY_JOB,
      { notificationId },
      {
        jobId: `notif-retry-${notificationId}-${Date.now()}`,
        removeOnComplete: 100,
        removeOnFail: 200,
      },
    );

    this.logger.log(`[notification] Requeued: id=${notificationId}`);
    return true;
  }

  /**
   * Requeue all FAILED notifications (admin bulk operation).
   * Returns the count of requeued notifications.
   */
  async requeueFailed(limit: number = 100): Promise<number> {
    const failed = await this.prisma.notificationLog.findMany({
      where: { status: NotificationStatus.FAILED },
      select: { id: true },
      take: limit,
      orderBy: { createdAt: 'asc' },
    });

    let count = 0;
    for (const log of failed) {
      const ok = await this.requeue(log.id);
      if (ok) count++;
    }

    this.logger.log(`[notification] Bulk requeued: ${count}/${failed.length}`);
    return count;
  }

  /**
   * Stable hash of notification identity fields.
   * Same inputs always produce the same key, ensuring idempotency.
   */
  computeIdempotencyKey(
    eventName: string,
    recipientId: string,
    channel: NotificationChannel,
    templateKey: string,
    variables: Record<string, string | number>,
  ): string {
    const input = JSON.stringify({
      eventName,
      recipientId,
      channel,
      templateKey,
      payload: variables,
    });
    return createHash('sha256').update(input).digest('hex');
  }
}

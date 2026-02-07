import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { Prisma, RfqDeliveryStatus, TravelRequestStatus } from '@prisma/client';
import { AgencyMatchingService } from './agency-matching.service';
import { RfqNotificationBuilder } from './rfq-notification.builder';
import {
  RFQ_DISTRIBUTION_QUEUE,
  RFQ_DISTRIBUTION_JOB,
  DistributionResult,
  RfqJobPayload,
  AgencyMatchResult,
  RfqNotificationPayload,
} from '../types';
import { TravelRequestDistributedEvent } from '../types';

@Injectable()
export class RfqDistributionService {
  private readonly logger = new Logger(RfqDistributionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: AgencyMatchingService,
    private readonly notificationBuilder: RfqNotificationBuilder,
    @InjectQueue(RFQ_DISTRIBUTION_QUEUE)
    private readonly rfqQueue: Queue<RfqJobPayload>,
  ) {}

  /**
   * Full distribution workflow:
   *
   *   1. Load TravelRequest
   *   2. Build notification payload
   *   3. Match agencies (scored + prioritized)
   *   4. Create RfqDistribution records (transaction)
   *   5. Update TravelRequest → DISTRIBUTED
   *   6. Enqueue delivery job per agency
   *   7. Emit domain event (logged for now)
   *   8. Return distribution summary
   *
   * If no agencies match, request stays in current status.
   * Individual delivery failures do NOT fail the whole distribution.
   */
  async distribute(travelRequestId: string): Promise<DistributionResult> {
    // 0. Idempotency guard — skip if already distributed
    const existingCount = await this.prisma.rfqDistribution.count({
      where: { travelRequestId },
    });
    if (existingCount > 0) {
      this.logger.warn(
        `Distribution already exists for request ${travelRequestId} ` +
          `(${existingCount} records) — skipping duplicate distribution`,
      );
      return {
        travelRequestId,
        totalAgenciesMatched: 0,
        distributionIds: [],
        agencyIds: [],
      };
    }

    // 1. Load request
    const request = await this.prisma.travelRequest.findUniqueOrThrow({
      where: { id: travelRequestId },
    });

    // 2. Build notification payload
    const notification = this.notificationBuilder.build(request);

    // 3. Match agencies
    const matchedAgencies = await this.matching.match({
      destination: request.destination,
      tripType: request.tripType,
      regions: request.destination ? [request.destination] : [],
    });

    if (matchedAgencies.length === 0) {
      this.logger.warn(
        `No agencies matched for RFQ ${travelRequestId} — skipping distribution`,
      );
      return {
        travelRequestId,
        totalAgenciesMatched: 0,
        distributionIds: [],
        agencyIds: [],
      };
    }

    // 4 + 5. Create distribution records + update status in transaction
    const distributionIds = await this.createDistributions(
      travelRequestId,
      matchedAgencies,
      notification,
    );

    // 6. Enqueue delivery jobs (non-blocking, per-agency)
    await this.enqueueDeliveries(
      distributionIds,
      travelRequestId,
      matchedAgencies,
      notification,
    );

    // 7. Emit domain event (logged)
    const event = new TravelRequestDistributedEvent(
      travelRequestId,
      request.userId,
      matchedAgencies,
      notification,
    );
    this.logDistributionEvent(event);

    // 8. Return result
    const agencyIds = matchedAgencies.map((a) => a.agencyId);

    this.logger.log(
      `RFQ ${travelRequestId} distributed to ${agencyIds.length} agencies — ` +
        `success rate pending delivery`,
    );

    return {
      travelRequestId,
      totalAgenciesMatched: matchedAgencies.length,
      distributionIds,
      agencyIds,
    };
  }

  /**
   * Called by job processor on delivery success.
   */
  async markDelivered(distributionId: string): Promise<void> {
    await this.prisma.rfqDistribution.update({
      where: { id: distributionId },
      data: {
        deliveryStatus: RfqDeliveryStatus.DELIVERED,
        deliveredAt: new Date(),
      },
    });
  }

  /**
   * Called by job processor on delivery failure.
   */
  async markFailed(distributionId: string, reason: string): Promise<void> {
    await this.prisma.rfqDistribution.update({
      where: { id: distributionId },
      data: {
        deliveryStatus: RfqDeliveryStatus.FAILED,
        failureReason: reason,
      },
    });
  }

  /**
   * Called when agency views the RFQ.
   */
  async markViewed(distributionId: string): Promise<void> {
    await this.prisma.rfqDistribution.update({
      where: { id: distributionId },
      data: {
        deliveryStatus: RfqDeliveryStatus.VIEWED,
        viewedAt: new Date(),
      },
    });
  }

  /**
   * Called when agency submits an offer.
   */
  async markResponded(distributionId: string): Promise<void> {
    await this.prisma.rfqDistribution.update({
      where: { id: distributionId },
      data: {
        deliveryStatus: RfqDeliveryStatus.RESPONDED,
        respondedAt: new Date(),
      },
    });
  }

  /**
   * Get distribution stats for observability.
   */
  async getDistributionStats(travelRequestId: string): Promise<{
    total: number;
    delivered: number;
    failed: number;
    viewed: number;
    responded: number;
    pending: number;
  }> {
    const records = await this.prisma.rfqDistribution.findMany({
      where: { travelRequestId },
    });

    return {
      total: records.length,
      delivered: records.filter((r) => r.deliveryStatus === RfqDeliveryStatus.DELIVERED).length,
      failed: records.filter((r) => r.deliveryStatus === RfqDeliveryStatus.FAILED).length,
      viewed: records.filter((r) => r.deliveryStatus === RfqDeliveryStatus.VIEWED).length,
      responded: records.filter((r) => r.deliveryStatus === RfqDeliveryStatus.RESPONDED).length,
      pending: records.filter((r) => r.deliveryStatus === RfqDeliveryStatus.PENDING).length,
    };
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async createDistributions(
    travelRequestId: string,
    agencies: AgencyMatchResult[],
    notification: RfqNotificationPayload,
  ): Promise<string[]> {
    const result = await this.prisma.$transaction(async (tx) => {
      // Create one RfqDistribution record per matched agency
      const distributions = await Promise.all(
        agencies.map((agency) =>
          tx.rfqDistribution.create({
            data: {
              travelRequestId,
              agencyId: agency.agencyId,
              deliveryStatus: RfqDeliveryStatus.PENDING,
              notificationPayload: notification as unknown as Prisma.InputJsonValue,
            },
          }),
        ),
      );

      // Update request status to DISTRIBUTED
      await tx.travelRequest.update({
        where: { id: travelRequestId },
        data: { status: TravelRequestStatus.DISTRIBUTED },
      });

      return distributions.map((d) => d.id);
    });

    return result;
  }

  private async enqueueDeliveries(
    distributionIds: string[],
    travelRequestId: string,
    agencies: AgencyMatchResult[],
    notification: RfqNotificationPayload,
  ): Promise<void> {
    const jobs = agencies.map((agency, index) => ({
      name: RFQ_DISTRIBUTION_JOB,
      data: {
        distributionId: distributionIds[index],
        travelRequestId,
        agencyId: agency.agencyId,
        agencyTelegramChatId: agency.telegramChatId
          ? agency.telegramChatId.toString()
          : null,
        notification,
      } satisfies RfqJobPayload,
      opts: {
        attempts: 3,
        backoff: { type: 'exponential' as const, delay: 2000 },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    }));

    await this.rfqQueue.addBulk(jobs);

    this.logger.debug(
      `Enqueued ${jobs.length} delivery jobs for RFQ ${travelRequestId}`,
    );
  }

  private logDistributionEvent(event: TravelRequestDistributedEvent): void {
    this.logger.log(
      `[EVENT] ${event.eventName}: ` +
        `request=${event.travelRequestId}, ` +
        `agencies=${event.agencyCount}, ` +
        `top_agencies=[${event.matchedAgencies
          .slice(0, 3)
          .map((a) => `${a.agencyName}(${a.matchScore.toFixed(1)})`)
          .join(', ')}]`,
    );
  }
}

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { RFQ_DISTRIBUTION_QUEUE, RfqJobPayload } from '../types';
import { RfqDistributionService } from '../services/rfq-distribution.service';
import { RfqNotificationBuilder } from '../services/rfq-notification.builder';
import { TelegramService } from '../../telegram/telegram.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AgencyManagementService } from '../../agencies/agency-management.service';

@Processor(RFQ_DISTRIBUTION_QUEUE)
export class RfqDistributionProcessor extends WorkerHost {
  private readonly logger = new Logger(RfqDistributionProcessor.name);

  constructor(
    private readonly distribution: RfqDistributionService,
    private readonly telegram: TelegramService,
    private readonly notificationBuilder: RfqNotificationBuilder,
    private readonly prisma: PrismaService,
    private readonly agencyMgmt: AgencyManagementService,
  ) {
    super();
  }

  /**
   * Processes a single agency RFQ delivery job.
   *
   * Delivers to ALL targets for the agency (deduplicated):
   *   1. Owner's private chat (from job payload)
   *   2. Shared agency group chat (agencyTelegramChatId, if set)
   *   3. All active agents' private chats
   *
   * Idempotent: if distribution is already DELIVERED, skips delivery.
   * Failures do NOT affect other agencies — each job is independent.
   * Marked DELIVERED if at least one target succeeds.
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

      // Resolve all delivery targets (deduplicated)
      const targets = await this.resolveDeliveryTargets(
        agencyId,
        agencyTelegramChatId,
      );

      if (targets.length === 0) {
        await this.distribution.markFailed(
          distributionId,
          `Agency ${agencyId} has no reachable delivery targets`,
        );
        this.logger.warn(
          `Agency ${agencyId} has no delivery targets — ` +
            `marked distribution ${distributionId} as FAILED`,
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

      // Send to all targets
      const sendResults = await Promise.allSettled(
        targets.map((targetChatId) =>
          this.telegram.sendRfqToAgency(
            Number(targetChatId),
            messageText,
            actions,
          ),
        ),
      );

      // Log individual delivery results
      for (let i = 0; i < targets.length; i++) {
        const status = sendResults[i].status;
        this.logger.log(
          `[rfq-delivery] target=${targets[i]}, agencyId=${agencyId}, ` +
            `result=${status}`,
        );
      }

      const successCount = sendResults.filter(
        (r) => r.status === 'fulfilled',
      ).length;

      if (successCount > 0) {
        await this.distribution.markDelivered(distributionId);
        this.logger.log(
          `[rfq-delivery] RFQ ${travelRequestId} → agency ${agencyId}: ` +
            `${successCount}/${targets.length} targets delivered`,
        );
      } else {
        // All sends failed
        const firstError = sendResults.find(
          (r) => r.status === 'rejected',
        ) as PromiseRejectedResult | undefined;
        const reason =
          firstError?.reason instanceof Error
            ? firstError.reason.message
            : 'All delivery targets failed';

        await this.distribution.markFailed(distributionId, reason);

        this.logger.error(
          `[rfq-delivery] RFQ ${travelRequestId} → agency ${agencyId}: ` +
            `all ${targets.length} targets failed — ${reason}`,
        );

        if (firstError?.reason && this.isTransientError(firstError.reason)) {
          throw firstError.reason;
        }
      }
    } catch (error) {
      // Only reaches here if rethrown for retry or unexpected error
      if (!(await this.isAlreadyDelivered(distributionId))) {
        const reason = error instanceof Error ? error.message : String(error);
        await this.distribution
          .markFailed(distributionId, reason)
          .catch(() => {});

        this.logger.error(
          `Failed to deliver RFQ ${travelRequestId} to agency ${agencyId}: ${reason}`,
        );
      }

      if (this.isTransientError(error)) {
        throw error;
      }
    }
  }

  /**
   * Resolves all unique delivery targets for an agency.
   * Collects: owner chat (payload), shared group chat, all active agents' chats.
   * Deduplicates by bigint value.
   */
  private async resolveDeliveryTargets(
    agencyId: string,
    agencyTelegramChatIdFromPayload: string | null,
  ): Promise<bigint[]> {
    const targetSet = new Set<bigint>();

    // 1. Owner's chat from job payload (legacy path)
    if (agencyTelegramChatIdFromPayload) {
      targetSet.add(BigInt(agencyTelegramChatIdFromPayload));
    }

    // 2. Shared agency group chat (new field)
    const agency = await this.prisma.agency.findUnique({
      where: { id: agencyId },
      select: { agencyTelegramChatId: true },
    });
    if (agency?.agencyTelegramChatId) {
      targetSet.add(agency.agencyTelegramChatId);
      this.logger.debug(
        `[rfq-delivery] agencyChatDelivered agencyId=${agencyId}, ` +
          `sharedChat=${agency.agencyTelegramChatId}`,
      );
    }

    // 3. All active agents' private chats
    const agentTelegramIds =
      await this.agencyMgmt.findActiveAgentTelegramIds(agencyId);
    for (const tid of agentTelegramIds) {
      targetSet.add(tid);
    }

    if (agentTelegramIds.length > 0) {
      this.logger.debug(
        `[rfq-delivery] managerDelivered agencyId=${agencyId}, ` +
          `agents=${agentTelegramIds.length}`,
      );
    }

    return Array.from(targetSet);
  }

  /**
   * Checks if this distribution has already been delivered (idempotency).
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
      if (
        ['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND'].some(
          (code) => message.includes(code),
        )
      ) {
        return true;
      }
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

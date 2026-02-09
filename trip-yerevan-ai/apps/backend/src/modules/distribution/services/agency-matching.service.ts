import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AgencyStatus, AgencyMembershipStatus } from '@prisma/client';
import { AgencyMatchResult } from '../types';

const MIN_RATING_THRESHOLD = 0;

/** Reasons an agency was rejected during matching. */
enum RejectionReason {
  MISSING_CHAT_ID = 'MISSING_CHAT_ID',
  SELF_DELIVERY_FILTER = 'SELF_DELIVERY_FILTER',
  NO_ACTIVE_AGENTS = 'NO_ACTIVE_AGENTS',
  REGION_MISMATCH = 'REGION_MISMATCH',
  SPECIALIZATION_MISMATCH = 'SPECIALIZATION_MISMATCH',
  NORMALIZATION_MISMATCH = 'NORMALIZATION_MISMATCH',
}

interface MatchCriteria {
  destination: string | null;
  tripType: string | null;
  regions: string[];
  /** Exclude agencies whose telegramChatId matches this value (self-delivery prevention). */
  excludeChatId?: bigint;
}

interface RejectedAgency {
  agencyId: string;
  reason: RejectionReason;
  detail: string;
}

@Injectable()
export class AgencyMatchingService {
  private readonly logger = new Logger(AgencyMatchingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Matches agencies to a travel request using multi-factor scoring:
   *
   *   1. Status must be APPROVED
   *   2. Must have a telegramChatId
   *   3. Must have at least one active AgencyMembership
   *   4. Must NOT match excludeChatId (self-delivery prevention)
   *   5. Score by: region match (+3), specialization match (+2), rating bonus (+0-1)
   *      Scoring is ADDITIVE (OR) — an agency does NOT need both region AND specialization
   *   6. Sort by score descending
   *   7. If no scored matches, fall back to all eligible agencies
   *
   * Returns prioritized list with match reasons.
   */
  async match(criteria: MatchCriteria): Promise<AgencyMatchResult[]> {
    // TASK 1 — Log request input
    this.logger.log(
      `[match-input] destination="${criteria.destination}", ` +
        `tripType="${criteria.tripType}", ` +
        `regions=[${criteria.regions.join(', ')}], ` +
        `excludeChatId=${criteria.excludeChatId ?? 'none'}`,
    );

    // Fetch all approved agencies above rating threshold, with active agents
    const agencies = await this.prisma.agency.findMany({
      where: {
        status: AgencyStatus.APPROVED,
        rating: { gte: MIN_RATING_THRESHOLD },
      },
      include: {
        memberships: {
          where: { status: AgencyMembershipStatus.ACTIVE },
          select: { id: true },
        },
      },
      orderBy: { rating: 'desc' },
    });

    if (agencies.length === 0) {
      this.logger.warn('[match-result] No approved agencies found in database');
      return [];
    }

    this.logger.debug(
      `[match-db] Loaded ${agencies.length} approved agencies from database`,
    );

    // Filter out ineligible agencies — track rejections for debug summary
    const rejected: RejectedAgency[] = [];
    const eligible = agencies.filter((agency) => {
      // TASK 2 — Log each agency evaluation
      this.logger.debug(
        `[match-eval] agencyId=${agency.id}, name="${agency.name}", ` +
          `status=${agency.status}, ` +
          `regions=[${agency.regions.join(', ')}], ` +
          `specializations=[${agency.specializations.join(', ')}], ` +
          `telegramChatId=${agency.telegramChatId ?? 'null'}, ` +
          `activeMembers=${agency.memberships.length}`,
      );

      if (!agency.telegramChatId) {
        rejected.push({
          agencyId: agency.id,
          reason: RejectionReason.MISSING_CHAT_ID,
          detail: 'telegramChatId is null',
        });
        this.logger.warn(
          `[agency-reject] agencyId=${agency.id}: ${RejectionReason.MISSING_CHAT_ID} — telegramChatId is null`,
        );
        return false;
      }

      if (
        criteria.excludeChatId &&
        agency.telegramChatId === criteria.excludeChatId
      ) {
        rejected.push({
          agencyId: agency.id,
          reason: RejectionReason.SELF_DELIVERY_FILTER,
          detail: `chatId=${agency.telegramChatId} matches traveler`,
        });
        this.logger.warn(
          `[agency-reject] agencyId=${agency.id}: ${RejectionReason.SELF_DELIVERY_FILTER} — chatId=${agency.telegramChatId} matches traveler`,
        );
        return false;
      }

      if (agency.memberships.length === 0) {
        rejected.push({
          agencyId: agency.id,
          reason: RejectionReason.NO_ACTIVE_AGENTS,
          detail: 'no active membership records',
        });
        this.logger.warn(
          `[agency-reject] agencyId=${agency.id}: ${RejectionReason.NO_ACTIVE_AGENTS} — no active membership records`,
        );
        return false;
      }

      return true;
    });

    if (eligible.length === 0) {
      // TASK 6 — Debug summary on zero match
      this.logger.warn(
        `[match-result] All ${agencies.length} approved agencies rejected. ` +
          `Rejections: ${rejected.map((r) => `${r.agencyId}:${r.reason}`).join(', ')}`,
      );
      return [];
    }

    // Score each eligible agency
    const scored: AgencyMatchResult[] = [];

    // TASK 4 — Normalize destination and tripType once (trim + lowercase)
    const destNorm = criteria.destination?.toLowerCase().trim() ?? null;
    const tripTypeNorm = criteria.tripType?.toLowerCase().trim() ?? null;

    for (const agency of eligible) {
      const reasons: string[] = [];
      let score = 0;

      // TASK 4 — Normalize agency regions and specializations
      const agencyRegionsNorm = agency.regions.map((r) =>
        r.toLowerCase().trim(),
      );
      const agencySpecsNorm = agency.specializations.map((s) =>
        s.toLowerCase().trim(),
      );

      // Region match: does agency serve the destination region?
      if (destNorm) {
        const regionMatch = agencyRegionsNorm.some((r) => r === destNorm);
        if (regionMatch) {
          score += 3;
          reasons.push(`region:${criteria.destination}`);
        } else {
          // TASK 3 — Log region mismatch detail
          this.logger.debug(
            `[match-score] agencyId=${agency.id}: ${RejectionReason.REGION_MISMATCH} — ` +
              `dest="${criteria.destination}" not in regions=[${agency.regions.join(', ')}]`,
          );
        }
      }

      // Specialization match: does agency handle this trip type?
      if (tripTypeNorm) {
        const specMatch = agencySpecsNorm.some((s) => s === tripTypeNorm);
        if (specMatch) {
          score += 2;
          reasons.push(`specialization:${criteria.tripType}`);
        } else {
          // TASK 3 — Log specialization mismatch detail
          this.logger.debug(
            `[match-score] agencyId=${agency.id}: ${RejectionReason.SPECIALIZATION_MISMATCH} — ` +
              `tripType="${criteria.tripType}" not in specializations=[${agency.specializations.join(', ')}]`,
          );
        }
      }

      // Rating bonus: normalized 0-1
      const rating = Number(agency.rating);
      if (rating > 0) {
        score += Math.min(rating / 5, 1);
        reasons.push(`rating:${rating}`);
      }

      scored.push({
        agencyId: agency.id,
        agencyName: agency.name,
        telegramChatId: agency.telegramChatId,
        matchScore: score,
        matchReasons: reasons,
      });
    }

    // Sort by score descending, then rating
    scored.sort((a, b) => b.matchScore - a.matchScore);

    // If no agency scored above 0, return all eligible (broadened fallback)
    const hasScored = scored.some((s) => s.matchScore > 0);
    const results = hasScored
      ? scored.filter((s) => s.matchScore > 0)
      : scored;

    // TASK 6 — Debug summary
    const matchedIds = results.map((r) => r.agencyId);
    const rejectedIds = rejected.map((r) => `${r.agencyId}(${r.reason})`);
    const zeroScoreIds = scored
      .filter((s) => s.matchScore === 0 && hasScored)
      .map((s) => `${s.agencyId}(score=0)`);

    this.logger.log(
      `[match-result] input: destination="${criteria.destination}", tripType="${criteria.tripType}" | ` +
        `db=${agencies.length}, eligible=${eligible.length}, matched=${results.length} | ` +
        `matched=[${matchedIds.join(', ')}] | ` +
        `rejected=[${[...rejectedIds, ...zeroScoreIds].join(', ') || 'none'}] | ` +
        `fallback=${!hasScored}`,
    );

    return results;
  }
}

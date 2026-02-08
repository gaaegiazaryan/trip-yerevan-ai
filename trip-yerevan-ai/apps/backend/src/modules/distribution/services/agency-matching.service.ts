import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AgencyStatus, AgentStatus } from '@prisma/client';
import { AgencyMatchResult } from '../types';

const MIN_RATING_THRESHOLD = 0;

interface MatchCriteria {
  destination: string | null;
  tripType: string | null;
  regions: string[];
  /** Exclude agencies whose telegramChatId matches this value (self-delivery prevention). */
  excludeChatId?: bigint;
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
   *   3. Must have at least one active AgencyAgent
   *   4. Must NOT match excludeChatId (self-delivery prevention)
   *   5. Score by: region match (+3), specialization match (+2), rating bonus (+0-1)
   *   6. Sort by score descending
   *   7. If no scored matches, fall back to all eligible agencies
   *
   * Returns prioritized list with match reasons.
   */
  async match(criteria: MatchCriteria): Promise<AgencyMatchResult[]> {
    // Fetch all approved agencies above rating threshold, with active agents
    const agencies = await this.prisma.agency.findMany({
      where: {
        status: AgencyStatus.APPROVED,
        rating: { gte: MIN_RATING_THRESHOLD },
      },
      include: {
        agents: {
          where: { status: AgentStatus.ACTIVE },
          select: { id: true },
        },
      },
      orderBy: { rating: 'desc' },
    });

    if (agencies.length === 0) {
      this.logger.warn('No approved agencies found for matching');
      return [];
    }

    // Filter out ineligible agencies
    const eligible = agencies.filter((agency) => {
      if (!agency.telegramChatId) {
        this.logger.warn(
          `[agency-skip] agencyId=${agency.id}: missing telegramChatId`,
        );
        return false;
      }

      if (
        criteria.excludeChatId &&
        agency.telegramChatId === criteria.excludeChatId
      ) {
        this.logger.warn(
          `[agency-skip] agencyId=${agency.id}: same chatId as traveler (self-delivery prevented)`,
        );
        return false;
      }

      if (agency.agents.length === 0) {
        this.logger.warn(
          `[agency-skip] agencyId=${agency.id}: no active agents`,
        );
        return false;
      }

      return true;
    });

    if (eligible.length === 0) {
      this.logger.warn(
        `All ${agencies.length} approved agencies filtered out — no eligible recipients`,
      );
      return [];
    }

    // Score each eligible agency
    const scored: AgencyMatchResult[] = [];

    for (const agency of eligible) {
      const reasons: string[] = [];
      let score = 0;

      // Region match: does agency serve the destination region?
      if (criteria.destination) {
        const destLower = criteria.destination.toLowerCase();
        const regionMatch = agency.regions.some(
          (r) => r.toLowerCase() === destLower,
        );
        if (regionMatch) {
          score += 3;
          reasons.push(`region:${criteria.destination}`);
        }
      }

      // Specialization match: does agency handle this trip type?
      if (criteria.tripType) {
        const specMatch = agency.specializations.some(
          (s) => s.toLowerCase() === criteria.tripType!.toLowerCase(),
        );
        if (specMatch) {
          score += 2;
          reasons.push(`specialization:${criteria.tripType}`);
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

    this.logger.debug(
      `Matched ${results.length}/${agencies.length} agencies ` +
        `(eligible: ${eligible.length}, ` +
        `top: ${results[0]?.agencyName ?? 'none'}, score: ${results[0]?.matchScore ?? 0})`,
    );

    return results;
  }
}

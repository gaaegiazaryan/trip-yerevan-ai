import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationCategory,
  NotificationChannel,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface CachedPolicy {
  category: NotificationCategory;
  allowedChannels: string[];
  forceDeliver: boolean;
}

interface CachedRoleDefault {
  enabled: boolean;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class NotificationPreferenceResolver {
  private readonly logger = new Logger(NotificationPreferenceResolver.name);

  // In-memory caches with TTL
  private policyCache = new Map<string, { data: CachedPolicy; expiresAt: number }>();
  private roleDefaultCache = new Map<string, { data: CachedRoleDefault | null; expiresAt: number }>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve whether a notification should be delivered to a user on a given channel.
   *
   * Resolution hierarchy:
   * 1. SystemNotificationPolicy.forceDeliver → always true
   * 2. UserNotificationPreference (user-level override)
   * 3. RoleNotificationDefault (role-level default)
   * 4. System fallback: CRITICAL/TRANSACTIONAL = true, MARKETING = false
   */
  async isChannelEnabled(
    userId: string,
    role: UserRole,
    templateKey: string,
    channel: NotificationChannel,
  ): Promise<{ enabled: boolean; reason: string }> {
    // 1. Load policy for templateKey
    const policy = await this.loadPolicy(templateKey);

    if (policy?.forceDeliver) {
      return { enabled: true, reason: 'FORCE_DELIVER' };
    }

    // 2. Determine category
    const category = policy?.category ?? NotificationCategory.TRANSACTIONAL;

    // 3. Check allowed channels (if policy exists)
    if (policy && !policy.allowedChannels.includes(channel)) {
      return { enabled: false, reason: 'CHANNEL_NOT_ALLOWED' };
    }

    // 4. Check user preference
    const userPref = await this.prisma.userNotificationPreference.findUnique({
      where: {
        userId_category_channel: { userId, category, channel },
      },
      select: { enabled: true },
    });

    if (userPref !== null) {
      return {
        enabled: userPref.enabled,
        reason: userPref.enabled ? 'USER_PREF_ENABLED' : 'USER_PREF_DISABLED',
      };
    }

    // 5. Check role default
    const roleDefault = await this.loadRoleDefault(role, category, channel);

    if (roleDefault !== null) {
      return {
        enabled: roleDefault.enabled,
        reason: roleDefault.enabled ? 'ROLE_DEFAULT_ENABLED' : 'ROLE_DEFAULT_DISABLED',
      };
    }

    // 6. System fallback
    const fallback = category !== NotificationCategory.MARKETING;
    return {
      enabled: fallback,
      reason: fallback ? 'SYSTEM_FALLBACK_ENABLED' : 'SYSTEM_FALLBACK_DISABLED',
    };
  }

  /**
   * Batch resolve preferences for multiple requests.
   * Reduces N+1 by preloading policies and role defaults.
   */
  async batchResolve(
    requests: Array<{
      userId: string;
      role: UserRole;
      templateKey: string;
      channel: NotificationChannel;
    }>,
  ): Promise<Map<number, { enabled: boolean; reason: string }>> {
    const results = new Map<number, { enabled: boolean; reason: string }>();

    // Preload unique policies
    const uniqueKeys = [...new Set(requests.map((r) => r.templateKey))];
    await Promise.all(uniqueKeys.map((k) => this.loadPolicy(k)));

    // Resolve each
    for (let i = 0; i < requests.length; i++) {
      const r = requests[i];
      results.set(
        i,
        await this.isChannelEnabled(r.userId, r.role, r.templateKey, r.channel),
      );
    }

    return results;
  }

  /**
   * Clear all caches. Called when admin updates policies or role defaults.
   */
  clearCache(): void {
    this.policyCache.clear();
    this.roleDefaultCache.clear();
    this.logger.log('[preference-resolver] Cache cleared');
  }

  private async loadPolicy(templateKey: string): Promise<CachedPolicy | null> {
    const now = Date.now();
    const cached = this.policyCache.get(templateKey);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    const policy = await this.prisma.systemNotificationPolicy.findUnique({
      where: { templateKey },
      select: { category: true, allowedChannels: true, forceDeliver: true },
    });

    if (!policy) {
      // Cache the miss as null sentinel
      this.policyCache.set(templateKey, {
        data: null as any,
        expiresAt: now + CACHE_TTL_MS,
      });
      return null;
    }

    const data: CachedPolicy = {
      category: policy.category,
      allowedChannels: policy.allowedChannels as string[],
      forceDeliver: policy.forceDeliver,
    };

    this.policyCache.set(templateKey, { data, expiresAt: now + CACHE_TTL_MS });
    return data;
  }

  private async loadRoleDefault(
    role: UserRole,
    category: NotificationCategory,
    channel: NotificationChannel,
  ): Promise<CachedRoleDefault | null> {
    const cacheKey = `${role}:${category}:${channel}`;
    const now = Date.now();
    const cached = this.roleDefaultCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    const roleDefault = await this.prisma.roleNotificationDefault.findUnique({
      where: {
        role_category_channel: { role, category, channel },
      },
      select: { enabled: true },
    });

    const data = roleDefault ? { enabled: roleDefault.enabled } : null;
    this.roleDefaultCache.set(cacheKey, {
      data,
      expiresAt: now + CACHE_TTL_MS,
    });
    return data;
  }
}

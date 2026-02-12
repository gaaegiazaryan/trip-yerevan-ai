import { NotificationPreferenceResolver } from '../notification-preference.resolver';
import {
  NotificationCategory,
  NotificationChannel,
  UserRole,
} from '@prisma/client';

describe('NotificationPreferenceResolver', () => {
  let resolver: NotificationPreferenceResolver;
  let prisma: {
    systemNotificationPolicy: { findUnique: jest.Mock };
    userNotificationPreference: { findUnique: jest.Mock };
    roleNotificationDefault: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      systemNotificationPolicy: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      userNotificationPreference: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      roleNotificationDefault: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    resolver = new NotificationPreferenceResolver(prisma as any);
  });

  describe('CRITICAL forceDeliver', () => {
    it('should always return enabled when forceDeliver is true, ignoring user prefs', async () => {
      prisma.systemNotificationPolicy.findUnique.mockResolvedValue({
        category: NotificationCategory.CRITICAL,
        allowedChannels: ['TELEGRAM'],
        forceDeliver: true,
      });

      // User explicitly disabled — should still deliver
      prisma.userNotificationPreference.findUnique.mockResolvedValue({
        enabled: false,
      });

      const result = await resolver.isChannelEnabled(
        'user-1',
        UserRole.TRAVELER,
        'booking.created.traveler',
        NotificationChannel.TELEGRAM,
      );

      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('FORCE_DELIVER');
      // User pref should NOT be queried because forceDeliver short-circuits
      expect(prisma.userNotificationPreference.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('User override', () => {
    it('should use user preference when it exists (enabled)', async () => {
      prisma.systemNotificationPolicy.findUnique.mockResolvedValue({
        category: NotificationCategory.MARKETING,
        allowedChannels: ['TELEGRAM'],
        forceDeliver: false,
      });
      prisma.userNotificationPreference.findUnique.mockResolvedValue({
        enabled: true,
      });

      const result = await resolver.isChannelEnabled(
        'user-1',
        UserRole.TRAVELER,
        'promo.weekly',
        NotificationChannel.TELEGRAM,
      );

      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('USER_PREF_ENABLED');
    });

    it('should use user preference when it exists (disabled)', async () => {
      prisma.systemNotificationPolicy.findUnique.mockResolvedValue({
        category: NotificationCategory.MARKETING,
        allowedChannels: ['TELEGRAM'],
        forceDeliver: false,
      });
      prisma.userNotificationPreference.findUnique.mockResolvedValue({
        enabled: false,
      });

      const result = await resolver.isChannelEnabled(
        'user-1',
        UserRole.TRAVELER,
        'promo.weekly',
        NotificationChannel.TELEGRAM,
      );

      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('USER_PREF_DISABLED');
    });
  });

  describe('Role default', () => {
    it('should fall back to role default when no user preference exists', async () => {
      prisma.systemNotificationPolicy.findUnique.mockResolvedValue({
        category: NotificationCategory.MARKETING,
        allowedChannels: ['TELEGRAM'],
        forceDeliver: false,
      });
      prisma.userNotificationPreference.findUnique.mockResolvedValue(null);
      prisma.roleNotificationDefault.findUnique.mockResolvedValue({
        enabled: false,
      });

      const result = await resolver.isChannelEnabled(
        'user-1',
        UserRole.TRAVELER,
        'promo.weekly',
        NotificationChannel.TELEGRAM,
      );

      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('ROLE_DEFAULT_DISABLED');
    });

    it('should use enabled role default', async () => {
      prisma.systemNotificationPolicy.findUnique.mockResolvedValue({
        category: NotificationCategory.TRANSACTIONAL,
        allowedChannels: ['TELEGRAM'],
        forceDeliver: false,
      });
      prisma.userNotificationPreference.findUnique.mockResolvedValue(null);
      prisma.roleNotificationDefault.findUnique.mockResolvedValue({
        enabled: true,
      });

      const result = await resolver.isChannelEnabled(
        'user-1',
        UserRole.MANAGER,
        'booking.update',
        NotificationChannel.TELEGRAM,
      );

      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('ROLE_DEFAULT_ENABLED');
    });
  });

  describe('System fallback', () => {
    it('should enable TRANSACTIONAL by default when no policy/pref/roleDefault', async () => {
      // No policy → category defaults to TRANSACTIONAL
      const result = await resolver.isChannelEnabled(
        'user-1',
        UserRole.TRAVELER,
        'unknown.template',
        NotificationChannel.TELEGRAM,
      );

      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('SYSTEM_FALLBACK_ENABLED');
    });

    it('should disable MARKETING by default when no user/role prefs', async () => {
      prisma.systemNotificationPolicy.findUnique.mockResolvedValue({
        category: NotificationCategory.MARKETING,
        allowedChannels: ['TELEGRAM'],
        forceDeliver: false,
      });

      const result = await resolver.isChannelEnabled(
        'user-1',
        UserRole.TRAVELER,
        'promo.weekly',
        NotificationChannel.TELEGRAM,
      );

      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('SYSTEM_FALLBACK_DISABLED');
    });
  });

  describe('Channel not allowed', () => {
    it('should return disabled when channel is not in allowedChannels', async () => {
      prisma.systemNotificationPolicy.findUnique.mockResolvedValue({
        category: NotificationCategory.TRANSACTIONAL,
        allowedChannels: ['TELEGRAM'],
        forceDeliver: false,
      });

      const result = await resolver.isChannelEnabled(
        'user-1',
        UserRole.TRAVELER,
        'booking.update',
        NotificationChannel.EMAIL,
      );

      expect(result.enabled).toBe(false);
      expect(result.reason).toBe('CHANNEL_NOT_ALLOWED');
    });
  });

  describe('Caching', () => {
    it('should cache policy and not query DB on second call', async () => {
      prisma.systemNotificationPolicy.findUnique.mockResolvedValue({
        category: NotificationCategory.CRITICAL,
        allowedChannels: ['TELEGRAM'],
        forceDeliver: true,
      });

      await resolver.isChannelEnabled(
        'user-1',
        UserRole.TRAVELER,
        'booking.created.traveler',
        NotificationChannel.TELEGRAM,
      );

      await resolver.isChannelEnabled(
        'user-2',
        UserRole.TRAVELER,
        'booking.created.traveler',
        NotificationChannel.TELEGRAM,
      );

      // Policy should only be queried once (cached)
      expect(prisma.systemNotificationPolicy.findUnique).toHaveBeenCalledTimes(1);
    });

    it('should cache role defaults and not query DB on second call', async () => {
      prisma.systemNotificationPolicy.findUnique.mockResolvedValue({
        category: NotificationCategory.TRANSACTIONAL,
        allowedChannels: ['TELEGRAM'],
        forceDeliver: false,
      });
      prisma.roleNotificationDefault.findUnique.mockResolvedValue({
        enabled: true,
      });

      await resolver.isChannelEnabled(
        'user-1',
        UserRole.TRAVELER,
        'booking.update',
        NotificationChannel.TELEGRAM,
      );

      await resolver.isChannelEnabled(
        'user-2',
        UserRole.TRAVELER,
        'booking.update',
        NotificationChannel.TELEGRAM,
      );

      // Role default should only be queried once (cached)
      expect(prisma.roleNotificationDefault.findUnique).toHaveBeenCalledTimes(1);
    });

    it('should clear cache when clearCache() is called', async () => {
      prisma.systemNotificationPolicy.findUnique.mockResolvedValue({
        category: NotificationCategory.CRITICAL,
        allowedChannels: ['TELEGRAM'],
        forceDeliver: true,
      });

      await resolver.isChannelEnabled(
        'user-1',
        UserRole.TRAVELER,
        'booking.created.traveler',
        NotificationChannel.TELEGRAM,
      );

      resolver.clearCache();

      await resolver.isChannelEnabled(
        'user-1',
        UserRole.TRAVELER,
        'booking.created.traveler',
        NotificationChannel.TELEGRAM,
      );

      // Should query DB again after cache clear
      expect(prisma.systemNotificationPolicy.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('Hierarchy precedence', () => {
    it('should prefer user override over role default', async () => {
      prisma.systemNotificationPolicy.findUnique.mockResolvedValue({
        category: NotificationCategory.MARKETING,
        allowedChannels: ['TELEGRAM'],
        forceDeliver: false,
      });
      // User explicitly enables
      prisma.userNotificationPreference.findUnique.mockResolvedValue({
        enabled: true,
      });
      // Role default disables
      prisma.roleNotificationDefault.findUnique.mockResolvedValue({
        enabled: false,
      });

      const result = await resolver.isChannelEnabled(
        'user-1',
        UserRole.TRAVELER,
        'promo.weekly',
        NotificationChannel.TELEGRAM,
      );

      expect(result.enabled).toBe(true);
      expect(result.reason).toBe('USER_PREF_ENABLED');
      // Role default should NOT be queried because user pref was found
      expect(prisma.roleNotificationDefault.findUnique).not.toHaveBeenCalled();
    });
  });
});

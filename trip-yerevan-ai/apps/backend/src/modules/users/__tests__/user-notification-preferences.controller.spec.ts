import { UserNotificationPreferencesController } from '../user-notification-preferences.controller';
import {
  NotificationCategory,
  NotificationChannel,
} from '@prisma/client';

describe('UserNotificationPreferencesController', () => {
  let controller: UserNotificationPreferencesController;
  let prisma: {
    userNotificationPreference: {
      findMany: jest.Mock;
      upsert: jest.Mock;
    };
    systemNotificationPolicy: {
      findMany: jest.Mock;
    };
  };

  const mockReq = { user: { id: 'user-1', role: 'TRAVELER' } };

  beforeEach(() => {
    prisma = {
      userNotificationPreference: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockImplementation(({ create }) =>
          Promise.resolve({ id: 'pref-1', ...create }),
        ),
      },
      systemNotificationPolicy: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    controller = new UserNotificationPreferencesController(prisma as any);
  });

  describe('GET /me/notification-preferences', () => {
    it('should return user preferences', async () => {
      const prefs = [
        {
          id: 'pref-1',
          category: NotificationCategory.MARKETING,
          channel: NotificationChannel.TELEGRAM,
          enabled: false,
        },
      ];
      prisma.userNotificationPreference.findMany.mockResolvedValue(prefs);

      const result = await controller.getPreferences(mockReq);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(prefs);
      expect(prisma.userNotificationPreference.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 'user-1' },
        }),
      );
    });

    it('should throw when no user on request', async () => {
      await expect(
        controller.getPreferences({ user: null }),
      ).rejects.toThrow();
    });
  });

  describe('PUT /me/notification-preferences', () => {
    it('should upsert user preferences', async () => {
      const result = await controller.updatePreferences(mockReq, {
        preferences: [
          {
            category: NotificationCategory.MARKETING,
            channel: NotificationChannel.TELEGRAM,
            enabled: false,
          },
        ],
      });

      expect(result.success).toBe(true);
      expect(prisma.userNotificationPreference.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_category_channel: {
              userId: 'user-1',
              category: NotificationCategory.MARKETING,
              channel: NotificationChannel.TELEGRAM,
            },
          },
          update: { enabled: false },
          create: {
            userId: 'user-1',
            category: NotificationCategory.MARKETING,
            channel: NotificationChannel.TELEGRAM,
            enabled: false,
          },
        }),
      );
    });

    it('should reject disabling all CRITICAL channels', async () => {
      await expect(
        controller.updatePreferences(mockReq, {
          preferences: [
            {
              category: NotificationCategory.CRITICAL,
              channel: NotificationChannel.TELEGRAM,
              enabled: false,
            },
          ],
        }),
      ).rejects.toThrow('Cannot disable all channels for CRITICAL notifications');
    });

    it('should allow CRITICAL if at least one channel remains enabled', async () => {
      const result = await controller.updatePreferences(mockReq, {
        preferences: [
          {
            category: NotificationCategory.CRITICAL,
            channel: NotificationChannel.TELEGRAM,
            enabled: true,
          },
          {
            category: NotificationCategory.CRITICAL,
            channel: NotificationChannel.EMAIL,
            enabled: false,
          },
        ],
      });

      expect(result.success).toBe(true);
    });

    it('should reject channel not allowed by policy', async () => {
      prisma.systemNotificationPolicy.findMany.mockResolvedValue([
        {
          category: NotificationCategory.TRANSACTIONAL,
          allowedChannels: ['TELEGRAM'],
        },
      ]);

      await expect(
        controller.updatePreferences(mockReq, {
          preferences: [
            {
              category: NotificationCategory.TRANSACTIONAL,
              channel: NotificationChannel.EMAIL,
              enabled: true,
            },
          ],
        }),
      ).rejects.toThrow('Channel EMAIL is not allowed for TRANSACTIONAL notifications');
    });
  });
});

import { AdminNotificationPoliciesController } from '../admin-notification-policies.controller';
import {
  NotificationCategory,
  NotificationChannel,
  UserRole,
} from '@prisma/client';

describe('AdminNotificationPoliciesController', () => {
  let controller: AdminNotificationPoliciesController;
  let prisma: {
    systemNotificationPolicy: {
      findMany: jest.Mock;
      count: jest.Mock;
      upsert: jest.Mock;
    };
    roleNotificationDefault: {
      findMany: jest.Mock;
      upsert: jest.Mock;
    };
  };
  let preferenceResolver: {
    clearCache: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      systemNotificationPolicy: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        upsert: jest.fn().mockResolvedValue({ id: 'p1', templateKey: 'test' }),
      },
      roleNotificationDefault: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({ id: 'rd1' }),
      },
    };
    preferenceResolver = {
      clearCache: jest.fn(),
    };

    controller = new AdminNotificationPoliciesController(
      prisma as any,
      preferenceResolver as any,
    );
  });

  describe('GET /admin/notification-policies', () => {
    it('should return paginated policies', async () => {
      const policies = [{ id: 'p1', templateKey: 'booking.created.agent' }];
      prisma.systemNotificationPolicy.findMany.mockResolvedValue(policies);
      prisma.systemNotificationPolicy.count.mockResolvedValue(1);

      const result = await controller.findAllPolicies({
        page: 1,
        limit: 20,
        skip: 0,
      } as any);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(policies);
    });

    it('should filter by category', async () => {
      await controller.findAllPolicies({
        category: NotificationCategory.CRITICAL,
        page: 1,
        limit: 20,
        skip: 0,
      } as any);

      expect(prisma.systemNotificationPolicy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { category: NotificationCategory.CRITICAL },
        }),
      );
    });
  });

  describe('PUT /admin/notification-policies/:templateKey', () => {
    it('should upsert a policy and clear cache', async () => {
      const result = await controller.updatePolicy('booking.created.agent', {
        category: NotificationCategory.CRITICAL,
        allowedChannels: [NotificationChannel.TELEGRAM],
        forceDeliver: true,
      });

      expect(result.success).toBe(true);
      expect(prisma.systemNotificationPolicy.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { templateKey: 'booking.created.agent' },
          update: expect.objectContaining({
            category: NotificationCategory.CRITICAL,
            forceDeliver: true,
          }),
        }),
      );
      expect(preferenceResolver.clearCache).toHaveBeenCalled();
    });
  });

  describe('GET /admin/notification-policies/role-defaults', () => {
    it('should return role defaults', async () => {
      const defaults = [
        { id: 'rd1', role: UserRole.TRAVELER, category: NotificationCategory.CRITICAL },
      ];
      prisma.roleNotificationDefault.findMany.mockResolvedValue(defaults);

      const result = await controller.findAllRoleDefaults({});

      expect(result.success).toBe(true);
      expect(result.data).toEqual(defaults);
    });

    it('should filter by role', async () => {
      await controller.findAllRoleDefaults({ role: UserRole.MANAGER });

      expect(prisma.roleNotificationDefault.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { role: UserRole.MANAGER },
        }),
      );
    });
  });

  describe('PUT /admin/notification-policies/role-defaults', () => {
    it('should upsert a role default and clear cache', async () => {
      const result = await controller.updateRoleDefault({
        role: UserRole.TRAVELER,
        category: NotificationCategory.MARKETING,
        channel: NotificationChannel.TELEGRAM,
        enabled: false,
      });

      expect(result.success).toBe(true);
      expect(prisma.roleNotificationDefault.upsert).toHaveBeenCalled();
      expect(preferenceResolver.clearCache).toHaveBeenCalled();
    });
  });
});

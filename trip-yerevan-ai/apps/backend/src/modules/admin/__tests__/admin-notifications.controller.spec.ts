import { AdminNotificationsController } from '../admin-notifications.controller';
import { NotificationChannel, NotificationStatus } from '@prisma/client';

describe('AdminNotificationsController', () => {
  let controller: AdminNotificationsController;
  let prisma: {
    notificationLog: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
    };
  };
  let notificationService: {
    requeue: jest.Mock;
    requeueFailed: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      notificationLog: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    notificationService = {
      requeue: jest.fn().mockResolvedValue(true),
      requeueFailed: jest.fn().mockResolvedValue(5),
    };

    controller = new AdminNotificationsController(
      prisma as any,
      notificationService as any,
    );
  });

  describe('GET /admin/notifications', () => {
    it('should return paginated notifications', async () => {
      const logs = [
        { id: 'n1', eventName: 'booking.created', status: 'PENDING' },
      ];
      prisma.notificationLog.findMany.mockResolvedValue(logs);
      prisma.notificationLog.count.mockResolvedValue(1);

      const result = await controller.findAll({
        page: 1,
        limit: 20,
        skip: 0,
      } as any);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(logs);
      expect(result.meta).toEqual({
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
      });
    });

    it('should filter by status', async () => {
      await controller.findAll({
        status: NotificationStatus.FAILED,
        page: 1,
        limit: 20,
        skip: 0,
      } as any);

      expect(prisma.notificationLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: NotificationStatus.FAILED },
        }),
      );
    });

    it('should filter by channel', async () => {
      await controller.findAll({
        channel: NotificationChannel.TELEGRAM,
        page: 1,
        limit: 20,
        skip: 0,
      } as any);

      expect(prisma.notificationLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { channel: NotificationChannel.TELEGRAM },
        }),
      );
    });
  });

  describe('GET /admin/notifications/:id', () => {
    it('should return notification detail', async () => {
      const log = { id: 'n1', eventName: 'booking.created' };
      prisma.notificationLog.findUnique.mockResolvedValue(log);

      const result = await controller.findById('n1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(log);
    });

    it('should throw 404 for non-existent notification', async () => {
      prisma.notificationLog.findUnique.mockResolvedValue(null);

      await expect(controller.findById('nonexistent')).rejects.toThrow(
        'Notification not found',
      );
    });
  });

  describe('POST /admin/notifications/:id/retry', () => {
    it('should requeue a FAILED notification', async () => {
      const result = await controller.retryOne('n1');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: 'n1', requeued: true });
      expect(notificationService.requeue).toHaveBeenCalledWith('n1');
    });

    it('should return fail when requeue returns false', async () => {
      notificationService.requeue.mockResolvedValue(false);

      const result = await controller.retryOne('n1');

      expect(result.success).toBe(false);
    });
  });

  describe('POST /admin/notifications/retry-failed', () => {
    it('should bulk requeue failed notifications', async () => {
      const result = await controller.retryFailed({ limit: 50 });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ requeuedCount: 5 });
      expect(notificationService.requeueFailed).toHaveBeenCalledWith(50);
    });
  });
});

import { NotificationService } from '../notification.service';
import { NotificationTemplateEngine } from '../notification-template.engine';
import { NotificationChannel, NotificationStatus, UserRole } from '@prisma/client';

describe('NotificationService (enqueue-only)', () => {
  let service: NotificationService;
  let templateEngine: NotificationTemplateEngine;
  let templateResolver: {
    resolve: jest.Mock;
  };
  let preferenceResolver: {
    isChannelEnabled: jest.Mock;
  };
  let prisma: {
    notificationLog: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      count: jest.Mock;
    };
  };
  let queue: { add: jest.Mock };

  beforeEach(() => {
    templateEngine = new NotificationTemplateEngine();
    templateEngine.register({
      key: 'test.notification',
      body: 'Hello {{name}}',
    });

    templateResolver = {
      resolve: jest.fn().mockResolvedValue({
        rendered: { templateKey: 'test.notification', text: 'Hello Alice' },
        version: '1.0',
        snapshot: 'Hello {{name}}',
        policyVersion: 'v1',
        source: 'db',
      }),
    };

    preferenceResolver = {
      isChannelEnabled: jest.fn().mockResolvedValue({
        enabled: true,
        reason: 'ROLE_DEFAULT_ENABLED',
      }),
    };

    prisma = {
      notificationLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
        findUnique: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    queue = { add: jest.fn().mockResolvedValue({}) };

    service = new NotificationService(
      prisma as any,
      templateEngine,
      templateResolver as any,
      preferenceResolver as any,
      queue as any,
    );
    service.onModuleInit();
  });

  const baseRequest = {
    eventName: 'booking.created',
    recipientId: 'user-1',
    recipientChatId: 12345,
    channel: NotificationChannel.TELEGRAM,
    templateKey: 'test.notification',
    variables: { name: 'Alice' },
  };

  describe('send', () => {
    it('should create PENDING log with template version info and enqueue BullMQ job', async () => {
      const result = await service.send(baseRequest);

      expect(result.deduplicated).toBe(false);
      expect(result.notificationId).toBe('log-1');
      expect(result.skipped).toBeUndefined();

      // Checks preferences
      expect(preferenceResolver.isChannelEnabled).toHaveBeenCalledWith(
        'user-1',
        UserRole.TRAVELER, // defaults when no recipientRole
        'test.notification',
        NotificationChannel.TELEGRAM,
      );

      // Resolves template
      expect(templateResolver.resolve).toHaveBeenCalledWith(
        'test.notification',
        NotificationChannel.TELEGRAM,
        { name: 'Alice' },
      );

      // Creates log with idempotencyKey + version info
      expect(prisma.notificationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: NotificationStatus.PENDING,
          templateVersion: '1.0',
          templateSnapshot: 'Hello {{name}}',
          policyVersion: 'v1',
        }),
      });

      // Enqueues job
      expect(queue.add).toHaveBeenCalledWith(
        'deliver',
        { notificationId: 'log-1' },
        expect.objectContaining({ jobId: 'notif-log-1' }),
      );
    });

    it('should use provided recipientRole', async () => {
      await service.send({ ...baseRequest, recipientRole: UserRole.MANAGER });

      expect(preferenceResolver.isChannelEnabled).toHaveBeenCalledWith(
        'user-1',
        UserRole.MANAGER,
        'test.notification',
        NotificationChannel.TELEGRAM,
      );
    });

    it('should create SKIPPED log when preferences disable the channel', async () => {
      preferenceResolver.isChannelEnabled.mockResolvedValue({
        enabled: false,
        reason: 'USER_PREF_DISABLED',
      });

      const result = await service.send(baseRequest);

      expect(result.skipped).toBe(true);
      expect(result.deduplicated).toBe(false);

      expect(prisma.notificationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: NotificationStatus.SKIPPED,
          skipReason: 'USER_PREF_DISABLED',
          templateKey: 'test.notification',
        }),
      });

      // Should NOT enqueue a BullMQ job
      expect(queue.add).not.toHaveBeenCalled();
      // Should NOT resolve template
      expect(templateResolver.resolve).not.toHaveBeenCalled();
    });

    it('should create SKIPPED log when role default disables', async () => {
      preferenceResolver.isChannelEnabled.mockResolvedValue({
        enabled: false,
        reason: 'ROLE_DEFAULT_DISABLED',
      });

      const result = await service.send(baseRequest);

      expect(result.skipped).toBe(true);
      expect(prisma.notificationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          status: NotificationStatus.SKIPPED,
          skipReason: 'ROLE_DEFAULT_DISABLED',
        }),
      });
    });

    it('should store null version info when using code fallback', async () => {
      templateResolver.resolve.mockResolvedValue({
        rendered: { templateKey: 'test.notification', text: 'Hello Alice' },
        version: null,
        snapshot: 'Hello Alice',
        policyVersion: null,
        source: 'code',
      });

      await service.send(baseRequest);

      expect(prisma.notificationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          templateVersion: null,
          templateSnapshot: 'Hello Alice',
          policyVersion: null,
        }),
      });
    });

    it('should still enqueue when template resolver fails (non-fatal)', async () => {
      templateResolver.resolve.mockRejectedValue(
        new Error('Template not found'),
      );

      const result = await service.send(baseRequest);

      expect(result.deduplicated).toBe(false);
      expect(prisma.notificationLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          templateVersion: null,
          templateSnapshot: null,
          policyVersion: null,
        }),
      });
    });

    it('should deduplicate when idempotencyKey already exists', async () => {
      prisma.notificationLog.findUnique.mockResolvedValue({
        id: 'existing-id',
        status: NotificationStatus.SENT,
      });

      const result = await service.send(baseRequest);

      expect(result.deduplicated).toBe(true);
      expect(result.notificationId).toBe('existing-id');
      expect(prisma.notificationLog.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should deduplicate even if existing log is PENDING', async () => {
      prisma.notificationLog.findUnique.mockResolvedValue({
        id: 'pending-id',
        status: NotificationStatus.PENDING,
      });

      const result = await service.send(baseRequest);

      expect(result.deduplicated).toBe(true);
      expect(prisma.notificationLog.create).not.toHaveBeenCalled();
    });

    it('should produce same idempotencyKey for same inputs', () => {
      const key1 = service.computeIdempotencyKey(
        'booking.created',
        'user-1',
        NotificationChannel.TELEGRAM,
        'test.notification',
        { name: 'Alice' },
      );
      const key2 = service.computeIdempotencyKey(
        'booking.created',
        'user-1',
        NotificationChannel.TELEGRAM,
        'test.notification',
        { name: 'Alice' },
      );
      expect(key1).toBe(key2);
    });

    it('should produce different idempotencyKey for different inputs', () => {
      const key1 = service.computeIdempotencyKey(
        'booking.created',
        'user-1',
        NotificationChannel.TELEGRAM,
        'test.notification',
        { name: 'Alice' },
      );
      const key2 = service.computeIdempotencyKey(
        'booking.created',
        'user-2',
        NotificationChannel.TELEGRAM,
        'test.notification',
        { name: 'Alice' },
      );
      expect(key1).not.toBe(key2);
    });
  });

  describe('sendAll', () => {
    it('should enqueue each notification individually', async () => {
      const req2 = { ...baseRequest, recipientId: 'user-2' };

      const results = await service.sendAll([baseRequest, req2]);

      expect(results).toHaveLength(2);
      expect(prisma.notificationLog.create).toHaveBeenCalledTimes(2);
      expect(queue.add).toHaveBeenCalledTimes(2);
    });

    it('should not throw when one enqueue fails', async () => {
      prisma.notificationLog.create
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce({ id: 'log-2' });

      const results = await service.sendAll([
        baseRequest,
        { ...baseRequest, recipientId: 'user-2' },
      ]);

      // Only second one succeeded
      expect(results).toHaveLength(1);
      expect(results[0].notificationId).toBe('log-2');
    });
  });

  describe('requeue', () => {
    it('should reset FAILED to PENDING and enqueue job', async () => {
      prisma.notificationLog.findUnique.mockResolvedValue({
        id: 'fail-1',
        status: NotificationStatus.FAILED,
      });

      const result = await service.requeue('fail-1');

      expect(result).toBe(true);
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'fail-1' },
        data: expect.objectContaining({
          status: NotificationStatus.PENDING,
          errorMessage: null,
          nextRetryAt: null,
        }),
      });
      expect(queue.add).toHaveBeenCalled();
    });

    it('should NOT requeue if status is SENT', async () => {
      prisma.notificationLog.findUnique.mockResolvedValue({
        id: 'sent-1',
        status: NotificationStatus.SENT,
      });

      const result = await service.requeue('sent-1');

      expect(result).toBe(false);
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should return false for non-existent notification', async () => {
      prisma.notificationLog.findUnique.mockResolvedValue(null);

      const result = await service.requeue('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('requeueFailed', () => {
    it('should requeue all FAILED notifications up to limit', async () => {
      prisma.notificationLog.findMany.mockResolvedValue([
        { id: 'f1' },
        { id: 'f2' },
      ]);
      // findUnique for requeue calls
      prisma.notificationLog.findUnique
        .mockResolvedValueOnce({ id: 'f1', status: NotificationStatus.FAILED })
        .mockResolvedValueOnce({ id: 'f2', status: NotificationStatus.FAILED });

      const count = await service.requeueFailed(10);

      expect(count).toBe(2);
      expect(queue.add).toHaveBeenCalledTimes(2);
    });
  });
});

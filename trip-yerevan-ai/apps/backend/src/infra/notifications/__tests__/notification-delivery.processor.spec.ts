import { NotificationDeliveryProcessor } from '../notification-delivery.processor';
import { NotificationChannel, NotificationStatus } from '@prisma/client';

describe('NotificationDeliveryProcessor', () => {
  let processor: NotificationDeliveryProcessor;
  let prisma: {
    notificationLog: {
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let templateResolver: {
    resolve: jest.Mock;
  };
  let telegramProvider: {
    channel: NotificationChannel;
    send: jest.Mock;
  };

  const mockLog = {
    id: 'notif-1',
    eventName: 'booking.created',
    recipientId: 'user-1',
    recipientChatId: 12345,
    channel: NotificationChannel.TELEGRAM,
    templateKey: 'test.tmpl',
    payload: { name: 'Alice' },
    status: NotificationStatus.PENDING,
    attemptCount: 0,
    nextRetryAt: null,
    lastAttemptAt: null,
    errorMessage: null,
    providerMessageId: null,
  };

  const mockJob = (data: { notificationId: string }) =>
    ({ data }) as any;

  beforeEach(() => {
    prisma = {
      notificationLog: {
        findUnique: jest.fn().mockResolvedValue({ ...mockLog }),
        update: jest.fn().mockResolvedValue({}),
      },
    };

    templateResolver = {
      resolve: jest.fn().mockResolvedValue({
        rendered: { templateKey: 'test.tmpl', text: 'Hello Alice', buttons: undefined },
        version: null,
        snapshot: 'Hello Alice',
        policyVersion: null,
        source: 'code',
      }),
    };

    telegramProvider = {
      channel: NotificationChannel.TELEGRAM,
      send: jest.fn().mockResolvedValue({ success: true, providerMessageId: '999' }),
    };

    processor = new NotificationDeliveryProcessor(
      prisma as any,
      templateResolver as any,
      [telegramProvider],
    );
  });

  describe('successful delivery', () => {
    it('should resolve template, send, and mark SENT', async () => {
      await processor.process(mockJob({ notificationId: 'notif-1' }));

      // Resolved template via resolver
      expect(templateResolver.resolve).toHaveBeenCalledWith(
        'test.tmpl',
        NotificationChannel.TELEGRAM,
        { name: 'Alice' },
      );

      // Incremented attemptCount
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: { attemptCount: 1, lastAttemptAt: expect.any(Date) },
      });

      // Sent via provider
      expect(telegramProvider.send).toHaveBeenCalledWith(
        12345,
        'Hello Alice',
        undefined,
      );

      // Marked as SENT
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          status: NotificationStatus.SENT,
          sentAt: expect.any(Date),
          providerMessageId: '999',
        }),
      });
    });

    it('should send buttons when template has them', async () => {
      templateResolver.resolve.mockResolvedValue({
        rendered: {
          templateKey: 'test.tmpl',
          text: 'Confirm?',
          buttons: [{ label: 'Yes', callbackData: 'ok' }],
        },
        version: '2.0',
        snapshot: 'Confirm?',
        policyVersion: null,
        source: 'db',
      });

      await processor.process(mockJob({ notificationId: 'notif-1' }));

      expect(telegramProvider.send).toHaveBeenCalledWith(
        12345,
        'Confirm?',
        [{ label: 'Yes', callbackData: 'ok' }],
      );
    });
  });

  describe('idempotency — already sent', () => {
    it('should skip if status is already SENT', async () => {
      prisma.notificationLog.findUnique.mockResolvedValue({
        ...mockLog,
        status: NotificationStatus.SENT,
      });

      await processor.process(mockJob({ notificationId: 'notif-1' }));

      expect(telegramProvider.send).not.toHaveBeenCalled();
      expect(prisma.notificationLog.update).not.toHaveBeenCalled();
    });
  });

  describe('max attempts exceeded', () => {
    it('should mark permanently FAILED when attemptCount >= MAX', async () => {
      prisma.notificationLog.findUnique.mockResolvedValue({
        ...mockLog,
        attemptCount: 5,
        status: NotificationStatus.FAILED,
      });

      await processor.process(mockJob({ notificationId: 'notif-1' }));

      expect(telegramProvider.send).not.toHaveBeenCalled();
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          status: NotificationStatus.FAILED,
          errorMessage: expect.stringContaining('max delivery attempts'),
          nextRetryAt: null,
        }),
      });
    });
  });

  describe('transient failure', () => {
    it('should throw to trigger BullMQ retry', async () => {
      telegramProvider.send.mockResolvedValue({
        success: false,
        errorMessage: 'Network timeout',
        permanent: false,
      });

      await expect(
        processor.process(mockJob({ notificationId: 'notif-1' })),
      ).rejects.toThrow('Transient failure');

      // Should have updated status to FAILED with nextRetryAt
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          status: NotificationStatus.FAILED,
          errorMessage: 'Network timeout',
          nextRetryAt: expect.any(Date),
        }),
      });
    });

    it('should increment attemptCount on transient failure', async () => {
      telegramProvider.send.mockResolvedValue({
        success: false,
        errorMessage: 'timeout',
        permanent: false,
      });

      await expect(
        processor.process(mockJob({ notificationId: 'notif-1' })),
      ).rejects.toThrow();

      // First call: increment attemptCount
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: { attemptCount: 1, lastAttemptAt: expect.any(Date) },
      });
    });
  });

  describe('permanent failure', () => {
    it('should NOT throw (no retry) for permanent errors', async () => {
      telegramProvider.send.mockResolvedValue({
        success: false,
        errorMessage: 'bot was blocked by the user',
        permanent: true,
      });

      // Should NOT throw
      await processor.process(mockJob({ notificationId: 'notif-1' }));

      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          status: NotificationStatus.FAILED,
          errorMessage: expect.stringContaining('Permanent'),
          nextRetryAt: null,
        }),
      });
    });
  });

  describe('template error', () => {
    it('should mark FAILED permanently when template not found', async () => {
      prisma.notificationLog.findUnique.mockResolvedValue({
        ...mockLog,
        templateKey: 'nonexistent',
      });

      templateResolver.resolve.mockRejectedValue(
        new Error('Template "nonexistent" not found in DB or code registry'),
      );

      await processor.process(mockJob({ notificationId: 'notif-1' }));

      expect(telegramProvider.send).not.toHaveBeenCalled();
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          status: NotificationStatus.FAILED,
          errorMessage: expect.stringContaining('Template render failed'),
          nextRetryAt: null,
        }),
      });
    });
  });

  describe('notification not found', () => {
    it('should skip gracefully', async () => {
      prisma.notificationLog.findUnique.mockResolvedValue(null);

      await processor.process(mockJob({ notificationId: 'gone' }));

      expect(telegramProvider.send).not.toHaveBeenCalled();
      expect(prisma.notificationLog.update).not.toHaveBeenCalled();
    });
  });

  describe('retry attempt tracking', () => {
    it('should track increasing attemptCount across retries', async () => {
      prisma.notificationLog.findUnique.mockResolvedValue({
        ...mockLog,
        attemptCount: 2,
        status: NotificationStatus.FAILED,
      });

      telegramProvider.send.mockResolvedValue({ success: true });

      await processor.process(mockJob({ notificationId: 'notif-1' }));

      // Should increment from 2 to 3
      expect(prisma.notificationLog.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: { attemptCount: 3, lastAttemptAt: expect.any(Date) },
      });
    });
  });

  describe('worker lifecycle events', () => {
    it('onReady should log startup without throwing', () => {
      expect(() => processor.onReady()).not.toThrow();
    });

    it('onActive should log job info without throwing', () => {
      const job = mockJob({ notificationId: 'notif-1' });
      job.id = 'job-123';
      expect(() => processor.onActive(job)).not.toThrow();
    });

    it('onCompleted should log job completion without throwing', () => {
      const job = mockJob({ notificationId: 'notif-1' });
      job.id = 'job-123';
      expect(() => processor.onCompleted(job)).not.toThrow();
    });

    it('onFailed should handle undefined job gracefully', () => {
      expect(() =>
        processor.onFailed(undefined, new Error('test')),
      ).not.toThrow();
    });

    it('onFailed should log job info when job is present', () => {
      const job = mockJob({ notificationId: 'notif-1' });
      job.id = 'job-123';
      expect(() =>
        processor.onFailed(job, new Error('timeout')),
      ).not.toThrow();
    });

    it('onError should log worker-level error without throwing', () => {
      expect(() => processor.onError(new Error('Redis down'))).not.toThrow();
    });

    it('onStalled should log stalled job without throwing', () => {
      expect(() => processor.onStalled('job-456')).not.toThrow();
    });
  });
});

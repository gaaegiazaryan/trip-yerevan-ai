import { SupportService } from '../support.service';
import { SupportThreadStatus } from '@prisma/client';

function createMockPrisma() {
  return {
    supportThread: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    supportMessage: {
      create: jest.fn(),
    },
    offer: {
      findUnique: jest.fn(),
    },
  };
}

function createMockConfig() {
  return {
    get: jest.fn().mockReturnValue('77777'),
  };
}

describe('SupportService', () => {
  let service: SupportService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let config: ReturnType<typeof createMockConfig>;

  beforeEach(() => {
    prisma = createMockPrisma();
    config = createMockConfig();
    service = new SupportService(prisma as any, config as any);
  });

  describe('getManagerChannelChatId', () => {
    it('should return parsed channel ID from config', () => {
      expect(service.getManagerChannelChatId()).toBe(77777);
    });

    it('should return null when config is not set', () => {
      config.get.mockReturnValue(undefined);
      const s = new SupportService(prisma as any, config as any);
      expect(s.getManagerChannelChatId()).toBeNull();
    });
  });

  describe('createThread', () => {
    it('should reuse existing OPEN thread for same user+offer', async () => {
      const existing = {
        id: 'thread-001',
        userId: 'user-001',
        offerId: 'offer-1',
        status: SupportThreadStatus.OPEN,
      };
      prisma.supportThread.findFirst.mockResolvedValue(existing);

      const result = await service.createThread('user-001', 'offer-1');

      expect(result).toBe(existing);
      expect(prisma.supportThread.create).not.toHaveBeenCalled();
    });

    it('should create new thread when no existing OPEN thread', async () => {
      prisma.supportThread.findFirst.mockResolvedValue(null);
      prisma.offer.findUnique.mockResolvedValue({ travelRequestId: 'tr-1' });

      const created = {
        id: 'thread-002',
        userId: 'user-001',
        offerId: 'offer-1',
        travelRequestId: 'tr-1',
        status: SupportThreadStatus.OPEN,
      };
      prisma.supportThread.create.mockResolvedValue(created);

      const result = await service.createThread('user-001', 'offer-1');

      expect(result).toBe(created);
      expect(prisma.supportThread.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-001',
          offerId: 'offer-1',
          travelRequestId: 'tr-1',
        },
      });
    });

    it('should handle missing offer gracefully', async () => {
      prisma.supportThread.findFirst.mockResolvedValue(null);
      prisma.offer.findUnique.mockResolvedValue(null);

      const created = {
        id: 'thread-003',
        userId: 'user-001',
        offerId: 'offer-1',
        travelRequestId: null,
        status: SupportThreadStatus.OPEN,
      };
      prisma.supportThread.create.mockResolvedValue(created);

      await service.createThread('user-001', 'offer-1');

      expect(prisma.supportThread.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-001',
          offerId: 'offer-1',
          travelRequestId: null,
        },
      });
    });
  });

  describe('addMessage', () => {
    it('should create a support message', async () => {
      const msg = {
        id: 'msg-001',
        threadId: 'thread-001',
        senderUserId: 'user-001',
        content: 'Hello?',
        createdAt: new Date(),
      };
      prisma.supportMessage.create.mockResolvedValue(msg);

      const result = await service.addMessage(
        'thread-001',
        'user-001',
        'Hello?',
      );

      expect(result).toBe(msg);
      expect(prisma.supportMessage.create).toHaveBeenCalledWith({
        data: {
          threadId: 'thread-001',
          senderUserId: 'user-001',
          content: 'Hello?',
        },
      });
    });
  });

  describe('markReplied', () => {
    it('should update thread status to REPLIED', async () => {
      await service.markReplied('thread-001');

      expect(prisma.supportThread.update).toHaveBeenCalledWith({
        where: { id: 'thread-001' },
        data: { status: SupportThreadStatus.REPLIED },
      });
    });
  });

  describe('getThread', () => {
    it('should load thread with user relation', async () => {
      const thread = {
        id: 'thread-001',
        userId: 'user-001',
        user: { telegramId: BigInt(123456) },
      };
      prisma.supportThread.findUnique.mockResolvedValue(thread);

      const result = await service.getThread('thread-001');

      expect(result).toBe(thread);
      expect(prisma.supportThread.findUnique).toHaveBeenCalledWith({
        where: { id: 'thread-001' },
        include: { user: { select: { telegramId: true } } },
      });
    });

    it('should return null for missing thread', async () => {
      prisma.supportThread.findUnique.mockResolvedValue(null);

      const result = await service.getThread('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('buildManagerNotification', () => {
    it('should format notification with reply button', () => {
      const thread = {
        id: 'thread-001',
        offerId: 'offer-1',
      } as any;

      const result = service.buildManagerNotification(thread, 'What about visa?');

      expect(result.text).toContain('New Support Question');
      expect(result.text).toContain('thread-001');
      expect(result.text).toContain('offer-1');
      expect(result.text).toContain('visa');
      expect(result.buttons).toEqual([
        {
          label: expect.stringContaining('Reply'),
          callbackData: 'support:reply:thread-001',
        },
      ]);
    });

    it('should omit offer line when offerId is null', () => {
      const thread = {
        id: 'thread-002',
        offerId: null,
      } as any;

      const result = service.buildManagerNotification(thread, 'General question');

      expect(result.text).not.toContain('Offer:');
    });
  });

  describe('buildTravelerReplyNotification', () => {
    it('should format manager reply', () => {
      const result = service.buildTravelerReplyNotification('Visa is included');

      expect(result).toContain('Manager Response');
      expect(result).toContain('Visa is included');
    });
  });
});

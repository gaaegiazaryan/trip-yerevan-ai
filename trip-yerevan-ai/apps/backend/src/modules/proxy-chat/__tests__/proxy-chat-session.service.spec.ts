import { ProxyChatSessionService } from '../proxy-chat-session.service';
import { ProxyChatService } from '../proxy-chat.service';
import { ContactLeakGuard } from '../contact-leak-guard';
import { ChatPermissionService } from '../chat-permission.service';
import { ChatAuditLogService } from '../chat-audit-log.service';
import { MessageContentType, MessageSenderType, ProxyChatStatus } from '@prisma/client';

function createMockPrisma() {
  return {
    offer: { findUnique: jest.fn() },
    proxyChat: { update: jest.fn(), findUnique: jest.fn() },
  };
}

function createMockProxyChatService() {
  return {
    findByParticipants: jest.fn(),
    create: jest.fn(),
    sendMessage: jest.fn(),
    close: jest.fn(),
  } as unknown as jest.Mocked<ProxyChatService>;
}

function createMockContactLeakGuard() {
  return {
    check: jest.fn().mockReturnValue({ blocked: false, violations: [], warningMessage: null }),
  } as unknown as jest.Mocked<ContactLeakGuard>;
}

function createMockChatPermission() {
  return {
    check: jest.fn().mockReturnValue({ allowed: true, flagged: false }),
  } as unknown as jest.Mocked<ChatPermissionService>;
}

function createMockChatAuditLog() {
  return {
    log: jest.fn(),
    findByChat: jest.fn(),
  } as unknown as jest.Mocked<ChatAuditLogService>;
}

const OWNER_USER_ID = 'user-owner-001';
const AGENT_TELEGRAM_ID = BigInt(99999);
const OFFER_ID = 'offer-001';
const AGENCY_ID = 'agency-001';
const TR_ID = 'tr-001';

function makeOffer(overrides: Record<string, unknown> = {}) {
  return {
    id: OFFER_ID,
    travelRequestId: TR_ID,
    agencyId: AGENCY_ID,
    travelRequest: { id: TR_ID, userId: OWNER_USER_ID, destination: 'Dubai' },
    agency: { id: AGENCY_ID, name: 'TravelCo', agencyTelegramChatId: null },
    membership: { user: { id: 'agent-user-001', telegramId: AGENT_TELEGRAM_ID } },
    ...overrides,
  };
}

describe('ProxyChatSessionService', () => {
  let service: ProxyChatSessionService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let proxyChatService: jest.Mocked<ProxyChatService>;
  let contactLeakGuard: jest.Mocked<ContactLeakGuard>;
  let chatPermission: jest.Mocked<ChatPermissionService>;
  let chatAuditLog: jest.Mocked<ChatAuditLogService>;

  beforeEach(() => {
    prisma = createMockPrisma();
    proxyChatService = createMockProxyChatService();
    contactLeakGuard = createMockContactLeakGuard();
    chatPermission = createMockChatPermission();
    chatAuditLog = createMockChatAuditLog();
    service = new ProxyChatSessionService(
      prisma as any,
      proxyChatService as any,
      contactLeakGuard as any,
      chatPermission as any,
      chatAuditLog as any,
    );
  });

  describe('session lifecycle', () => {
    it('should report no active session by default', () => {
      expect(service.hasActiveSession(12345)).toBe(false);
    });

    it('should clear session on exit', async () => {
      prisma.offer.findUnique.mockResolvedValue(makeOffer());
      proxyChatService.findByParticipants.mockResolvedValue(null);
      proxyChatService.create.mockResolvedValue({
        id: 'pc-1',
        travelRequestId: TR_ID,
        userId: OWNER_USER_ID,
        agencyId: AGENCY_ID,
        offerId: OFFER_ID,
        status: ProxyChatStatus.OPEN,
        closedReason: null,
        managerId: null,
        createdAt: new Date(),
        closedAt: null,
        lastActivityAt: new Date(),
        reopenedAt: null,
      });

      await service.startTravelerChat(12345, OFFER_ID, OWNER_USER_ID);
      expect(service.hasActiveSession(12345)).toBe(true);

      service.exitSession(12345);
      expect(service.hasActiveSession(12345)).toBe(false);
    });
  });

  describe('startTravelerChat', () => {
    it('should create new proxy chat and session', async () => {
      prisma.offer.findUnique.mockResolvedValue(makeOffer());
      proxyChatService.findByParticipants.mockResolvedValue(null);
      proxyChatService.create.mockResolvedValue({
        id: 'pc-1',
        travelRequestId: TR_ID,
        userId: OWNER_USER_ID,
        agencyId: AGENCY_ID,
        offerId: OFFER_ID,
        status: ProxyChatStatus.OPEN,
        closedReason: null,
        managerId: null,
        createdAt: new Date(),
        closedAt: null,
        lastActivityAt: new Date(),
        reopenedAt: null,
      });

      const result = await service.startTravelerChat(12345, OFFER_ID, OWNER_USER_ID);

      expect(result.text).toContain('TravelCo');
      expect(result.text).toContain('Dubai');
      expect(result.proxyChatId).toBe('pc-1');
      expect(service.hasActiveSession(12345)).toBe(true);

      const session = service.getSession(12345);
      expect(session?.senderType).toBe(MessageSenderType.USER);
      expect(session?.counterpartChatIds).toContain(Number(AGENT_TELEGRAM_ID));
      expect(session?.agencyName).toBe('TravelCo');
      expect(session?.lastActivityAt).toBeLessThanOrEqual(Date.now());
    });

    it('should reuse existing active proxy chat', async () => {
      prisma.offer.findUnique.mockResolvedValue(makeOffer());
      proxyChatService.findByParticipants.mockResolvedValue({
        id: 'pc-existing',
        travelRequestId: TR_ID,
        userId: OWNER_USER_ID,
        agencyId: AGENCY_ID,
        offerId: OFFER_ID,
        status: ProxyChatStatus.OPEN,
        closedReason: null,
        managerId: null,
        createdAt: new Date(),
        closedAt: null,
        lastActivityAt: new Date(),
        reopenedAt: null,
      });

      const result = await service.startTravelerChat(12345, OFFER_ID, OWNER_USER_ID);

      expect(proxyChatService.create).not.toHaveBeenCalled();
      expect(result.proxyChatId).toBe('pc-existing');
    });

    it('should reopen closed proxy chat', async () => {
      prisma.offer.findUnique.mockResolvedValue(makeOffer());
      proxyChatService.findByParticipants.mockResolvedValue({
        id: 'pc-closed',
        travelRequestId: TR_ID,
        userId: OWNER_USER_ID,
        agencyId: AGENCY_ID,
        offerId: OFFER_ID,
        status: ProxyChatStatus.CLOSED,
        closedReason: null,
        managerId: null,
        createdAt: new Date(),
        closedAt: new Date(),
        lastActivityAt: new Date(),
        reopenedAt: null,
      });
      prisma.proxyChat.update.mockResolvedValue({
        id: 'pc-closed',
        status: ProxyChatStatus.OPEN,
        travelRequestId: TR_ID,
        userId: OWNER_USER_ID,
        agencyId: AGENCY_ID,
        offerId: OFFER_ID,
        createdAt: new Date(),
        closedAt: null,
        lastActivityAt: new Date(),
        reopenedAt: null,
      });

      const result = await service.startTravelerChat(12345, OFFER_ID, OWNER_USER_ID);

      expect(prisma.proxyChat.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pc-closed' },
          data: expect.objectContaining({ status: ProxyChatStatus.OPEN }),
        }),
      );
      expect(result.proxyChatId).toBe('pc-closed');
    });

    it('should return error for non-existent offer', async () => {
      prisma.offer.findUnique.mockResolvedValue(null);

      const result = await service.startTravelerChat(12345, 'bad-offer', OWNER_USER_ID);

      expect(result.text).toContain('not found');
      expect(result.buttons).toBeUndefined();
    });

    it('should reject unauthorized user', async () => {
      prisma.offer.findUnique.mockResolvedValue(makeOffer());

      const result = await service.startTravelerChat(12345, OFFER_ID, 'other-user');

      expect(result.text).toContain('not authorized');
    });

    it('should deduplicate when agency group chat equals agent chat', async () => {
      prisma.offer.findUnique.mockResolvedValue(
        makeOffer({
          agency: {
            id: AGENCY_ID,
            name: 'TravelCo',
            agencyTelegramChatId: AGENT_TELEGRAM_ID,
          },
        }),
      );
      proxyChatService.findByParticipants.mockResolvedValue(null);
      proxyChatService.create.mockResolvedValue({
        id: 'pc-1',
        travelRequestId: TR_ID,
        userId: OWNER_USER_ID,
        agencyId: AGENCY_ID,
        offerId: OFFER_ID,
        status: ProxyChatStatus.OPEN,
        closedReason: null,
        managerId: null,
        createdAt: new Date(),
        closedAt: null,
        lastActivityAt: new Date(),
        reopenedAt: null,
      });

      await service.startTravelerChat(12345, OFFER_ID, OWNER_USER_ID);

      const session = service.getSession(12345);
      // Should only have one target (deduplicated)
      expect(session?.counterpartChatIds).toHaveLength(1);
    });
  });

  describe('handleMessage', () => {
    beforeEach(async () => {
      prisma.offer.findUnique.mockResolvedValue(makeOffer());
      proxyChatService.findByParticipants.mockResolvedValue(null);
      proxyChatService.create.mockResolvedValue({
        id: 'pc-1',
        travelRequestId: TR_ID,
        userId: OWNER_USER_ID,
        agencyId: AGENCY_ID,
        offerId: OFFER_ID,
        status: ProxyChatStatus.OPEN,
        closedReason: null,
        managerId: null,
        createdAt: new Date(),
        closedAt: null,
        lastActivityAt: new Date(),
        reopenedAt: null,
      });
      await service.startTravelerChat(12345, OFFER_ID, OWNER_USER_ID);
    });

    it('should store message in DB and return forward targets', async () => {
      proxyChatService.sendMessage.mockResolvedValue({} as any);

      const result = await service.handleMessage(
        12345,
        'What about visa?',
        MessageContentType.TEXT,
      );

      expect(proxyChatService.sendMessage).toHaveBeenCalledWith(
        'pc-1',
        MessageSenderType.USER,
        OWNER_USER_ID,
        'What about visa?',
        MessageContentType.TEXT,
        undefined,
      );

      expect(result.targets).toHaveLength(1);
      expect(result.targets[0].chatId).toBe(Number(AGENT_TELEGRAM_ID));
      expect(result.targets[0].text).toContain('Traveler');
      expect(result.targets[0].text).toContain('What about visa?');
      expect(result.blocked).toBeUndefined();
    });

    it('should return empty array when no session', async () => {
      const result = await service.handleMessage(
        99999,
        'No session',
        MessageContentType.TEXT,
      );

      expect(result.targets).toHaveLength(0);
    });
  });

  describe('closeChat', () => {
    it('should close in DB and clear session', async () => {
      prisma.offer.findUnique.mockResolvedValue(makeOffer());
      proxyChatService.findByParticipants.mockResolvedValue(null);
      proxyChatService.create.mockResolvedValue({
        id: 'pc-1',
        travelRequestId: TR_ID,
        userId: OWNER_USER_ID,
        agencyId: AGENCY_ID,
        offerId: OFFER_ID,
        status: ProxyChatStatus.OPEN,
        closedReason: null,
        managerId: null,
        createdAt: new Date(),
        closedAt: null,
        lastActivityAt: new Date(),
        reopenedAt: null,
      });

      await service.startTravelerChat(12345, OFFER_ID, OWNER_USER_ID);
      expect(service.hasActiveSession(12345)).toBe(true);

      await service.closeChat(12345, 'pc-1');

      expect(proxyChatService.close).toHaveBeenCalledWith('pc-1');
      expect(service.hasActiveSession(12345)).toBe(false);
    });
  });

  describe('startAgencyReply', () => {
    it('should return error for non-existent chat', async () => {
      prisma.proxyChat.findUnique.mockResolvedValue(null);

      const result = await service.startAgencyReply(99999, 'bad-id', AGENT_TELEGRAM_ID);

      expect(result.text).toContain('not found');
    });

    it('should return error for closed chat', async () => {
      prisma.proxyChat.findUnique.mockResolvedValue({
        id: 'pc-1',
        status: ProxyChatStatus.CLOSED,
        user: { id: OWNER_USER_ID, telegramId: BigInt(12345) },
        agency: {
          id: AGENCY_ID,
          name: 'TravelCo',
          memberships: [],
        },
        offer: { id: OFFER_ID },
        travelRequestId: TR_ID,
      });

      const result = await service.startAgencyReply(99999, 'pc-1', AGENT_TELEGRAM_ID);

      expect(result.text).toContain('closed');
    });

    it('should reject unauthorized agent', async () => {
      prisma.proxyChat.findUnique.mockResolvedValue({
        id: 'pc-1',
        status: ProxyChatStatus.OPEN,
        user: { id: OWNER_USER_ID, telegramId: BigInt(12345) },
        agency: {
          id: AGENCY_ID,
          name: 'TravelCo',
          memberships: [
            { userId: 'agent-user-001', user: { telegramId: AGENT_TELEGRAM_ID } },
          ],
        },
        offer: { id: OFFER_ID },
        travelRequestId: TR_ID,
      });

      const result = await service.startAgencyReply(
        99999,
        'pc-1',
        BigInt(11111), // different agent
      );

      expect(result.text).toContain('not authorized');
    });

    it('should create session for authorized agent', async () => {
      prisma.proxyChat.findUnique.mockResolvedValue({
        id: 'pc-1',
        status: ProxyChatStatus.OPEN,
        user: { id: OWNER_USER_ID, telegramId: BigInt(12345) },
        agency: {
          id: AGENCY_ID,
          name: 'TravelCo',
          memberships: [
            { userId: 'agent-user-001', user: { telegramId: AGENT_TELEGRAM_ID } },
          ],
        },
        offer: { id: OFFER_ID },
        travelRequestId: TR_ID,
      });

      const result = await service.startAgencyReply(99999, 'pc-1', AGENT_TELEGRAM_ID);

      expect(result.text).toContain('replying');
      expect(result.proxyChatId).toBe('pc-1');
      expect(service.hasActiveSession(99999)).toBe(true);

      const session = service.getSession(99999);
      expect(session?.senderType).toBe(MessageSenderType.AGENCY);
      expect(session?.counterpartChatIds).toContain(12345);
      expect(session?.agencyName).toBe('TravelCo');
      expect(session?.lastActivityAt).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('touchSession', () => {
    it('should update lastActivityAt timestamp', async () => {
      prisma.offer.findUnique.mockResolvedValue(makeOffer());
      proxyChatService.findByParticipants.mockResolvedValue(null);
      proxyChatService.create.mockResolvedValue({
        id: 'pc-1',
        travelRequestId: TR_ID,
        userId: OWNER_USER_ID,
        agencyId: AGENCY_ID,
        offerId: OFFER_ID,
        status: ProxyChatStatus.OPEN,
        closedReason: null,
        managerId: null,
        createdAt: new Date(),
        closedAt: null,
        lastActivityAt: new Date(),
        reopenedAt: null,
      });

      await service.startTravelerChat(12345, OFFER_ID, OWNER_USER_ID);
      const before = service.getSession(12345)!.lastActivityAt;

      // Small delay to ensure timestamp changes
      await new Promise((r) => setTimeout(r, 10));
      service.touchSession(12345);

      const after = service.getSession(12345)!.lastActivityAt;
      expect(after).toBeGreaterThan(before);
    });

    it('should be a no-op for unknown chat', () => {
      expect(() => service.touchSession(99999)).not.toThrow();
    });
  });

  describe('getExpiredSessions', () => {
    it('should return sessions older than threshold', async () => {
      prisma.offer.findUnique.mockResolvedValue(makeOffer());
      proxyChatService.findByParticipants.mockResolvedValue(null);
      proxyChatService.create.mockResolvedValue({
        id: 'pc-1',
        travelRequestId: TR_ID,
        userId: OWNER_USER_ID,
        agencyId: AGENCY_ID,
        offerId: OFFER_ID,
        status: ProxyChatStatus.OPEN,
        closedReason: null,
        managerId: null,
        createdAt: new Date(),
        closedAt: null,
        lastActivityAt: new Date(),
        reopenedAt: null,
      });

      await service.startTravelerChat(12345, OFFER_ID, OWNER_USER_ID);

      // Manually set lastActivityAt to the past
      const session = service.getSession(12345)!;
      session.lastActivityAt = Date.now() - 60_000; // 60s ago

      const expired = service.getExpiredSessions(30_000); // 30s threshold
      expect(expired).toHaveLength(1);
      expect(expired[0].chatId).toBe(12345);
    });

    it('should NOT return fresh sessions', async () => {
      prisma.offer.findUnique.mockResolvedValue(makeOffer());
      proxyChatService.findByParticipants.mockResolvedValue(null);
      proxyChatService.create.mockResolvedValue({
        id: 'pc-1',
        travelRequestId: TR_ID,
        userId: OWNER_USER_ID,
        agencyId: AGENCY_ID,
        offerId: OFFER_ID,
        status: ProxyChatStatus.OPEN,
        closedReason: null,
        managerId: null,
        createdAt: new Date(),
        closedAt: null,
        lastActivityAt: new Date(),
        reopenedAt: null,
      });

      await service.startTravelerChat(12345, OFFER_ID, OWNER_USER_ID);

      const expired = service.getExpiredSessions(30_000);
      expect(expired).toHaveLength(0);
    });
  });

  describe('setPinnedMessageId', () => {
    it('should store pinned message ID on session', async () => {
      prisma.offer.findUnique.mockResolvedValue(makeOffer());
      proxyChatService.findByParticipants.mockResolvedValue(null);
      proxyChatService.create.mockResolvedValue({
        id: 'pc-1',
        travelRequestId: TR_ID,
        userId: OWNER_USER_ID,
        agencyId: AGENCY_ID,
        offerId: OFFER_ID,
        status: ProxyChatStatus.OPEN,
        closedReason: null,
        managerId: null,
        createdAt: new Date(),
        closedAt: null,
        lastActivityAt: new Date(),
        reopenedAt: null,
      });

      await service.startTravelerChat(12345, OFFER_ID, OWNER_USER_ID);
      expect(service.getSession(12345)?.pinnedMessageId).toBeUndefined();

      service.setPinnedMessageId(12345, 777);
      expect(service.getSession(12345)?.pinnedMessageId).toBe(777);
    });

    it('should be a no-op for unknown chat', () => {
      expect(() => service.setPinnedMessageId(99999, 100)).not.toThrow();
    });
  });

  describe('setLastForwardedMsgId', () => {
    it('should store last forwarded message ID on session', async () => {
      prisma.offer.findUnique.mockResolvedValue(makeOffer());
      proxyChatService.findByParticipants.mockResolvedValue(null);
      proxyChatService.create.mockResolvedValue({
        id: 'pc-1',
        travelRequestId: TR_ID,
        userId: OWNER_USER_ID,
        agencyId: AGENCY_ID,
        offerId: OFFER_ID,
        status: ProxyChatStatus.OPEN,
        closedReason: null,
        managerId: null,
        createdAt: new Date(),
        closedAt: null,
        lastActivityAt: new Date(),
        reopenedAt: null,
      });

      await service.startTravelerChat(12345, OFFER_ID, OWNER_USER_ID);
      expect(service.getSession(12345)?.lastReceivedForwardedMsgId).toBeUndefined();

      service.setLastForwardedMsgId(12345, 999);
      expect(service.getSession(12345)?.lastReceivedForwardedMsgId).toBe(999);
    });

    it('should be a no-op for unknown chat', () => {
      expect(() => service.setLastForwardedMsgId(99999, 100)).not.toThrow();
    });
  });

  describe('session language field', () => {
    it('should default language to EN for traveler sessions', async () => {
      prisma.offer.findUnique.mockResolvedValue(makeOffer());
      proxyChatService.findByParticipants.mockResolvedValue(null);
      proxyChatService.create.mockResolvedValue({
        id: 'pc-1',
        travelRequestId: TR_ID,
        userId: OWNER_USER_ID,
        agencyId: AGENCY_ID,
        offerId: OFFER_ID,
        status: ProxyChatStatus.OPEN,
        closedReason: null,
        managerId: null,
        createdAt: new Date(),
        closedAt: null,
        lastActivityAt: new Date(),
        reopenedAt: null,
      });

      await service.startTravelerChat(12345, OFFER_ID, OWNER_USER_ID);
      const session = service.getSession(12345);
      expect(session?.language).toBe('EN');
    });
  });
});

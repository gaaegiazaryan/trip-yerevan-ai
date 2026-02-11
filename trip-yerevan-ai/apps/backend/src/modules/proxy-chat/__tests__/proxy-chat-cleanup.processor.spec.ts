import { ProxyChatCleanupProcessor } from '../proxy-chat-cleanup.processor';
import { CloseReason, ProxyChatState } from '@prisma/client';

function createMockProxyChatService() {
  return {
    findInactiveChats: jest.fn().mockResolvedValue([]),
    close: jest.fn(),
    getParticipantTelegramIds: jest.fn().mockResolvedValue(null),
  };
}

function createMockAuditLog() {
  return { log: jest.fn() };
}

function createMockTelegramService() {
  return {
    sendRfqToAgency: jest.fn().mockResolvedValue(101),
    sendMessage: jest.fn().mockResolvedValue(100),
  };
}

describe('ProxyChatCleanupProcessor', () => {
  let processor: ProxyChatCleanupProcessor;
  let proxyChatService: ReturnType<typeof createMockProxyChatService>;
  let auditLog: ReturnType<typeof createMockAuditLog>;
  let telegramService: ReturnType<typeof createMockTelegramService>;

  beforeEach(() => {
    proxyChatService = createMockProxyChatService();
    auditLog = createMockAuditLog();
    telegramService = createMockTelegramService();
    processor = new ProxyChatCleanupProcessor(
      proxyChatService as any,
      auditLog as any,
      telegramService as any,
    );
  });

  it('should close inactive chats', async () => {
    proxyChatService.findInactiveChats.mockResolvedValue([
      { id: 'pc-1', state: ProxyChatState.OPEN },
      { id: 'pc-2', state: ProxyChatState.REPLY_ONLY },
    ]);

    await processor.process({} as any);

    expect(proxyChatService.close).toHaveBeenCalledTimes(2);
    expect(proxyChatService.close).toHaveBeenCalledWith(
      'pc-1',
      CloseReason.INACTIVITY,
    );
    expect(proxyChatService.close).toHaveBeenCalledWith(
      'pc-2',
      CloseReason.INACTIVITY,
    );
    expect(auditLog.log).toHaveBeenCalledTimes(2);
  });

  it('should skip when no inactive chats', async () => {
    proxyChatService.findInactiveChats.mockResolvedValue([]);

    await processor.process({} as any);

    expect(proxyChatService.close).not.toHaveBeenCalled();
  });

  it('should handle individual close failures gracefully', async () => {
    proxyChatService.findInactiveChats.mockResolvedValue([
      { id: 'pc-1', state: ProxyChatState.OPEN },
      { id: 'pc-2', state: ProxyChatState.OPEN },
    ]);

    proxyChatService.close
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce({});

    // Should not throw
    await processor.process({} as any);

    // Second chat still processed
    expect(proxyChatService.close).toHaveBeenCalledTimes(2);
    // Only one audit log (the successful one)
    expect(auditLog.log).toHaveBeenCalledTimes(1);
  });

  it('should query with correct cutoff date', async () => {
    const now = new Date('2026-02-09T12:00:00Z');
    jest.useFakeTimers({ now });

    await processor.process({} as any);

    const callArg = proxyChatService.findInactiveChats.mock.calls[0][0];
    const expectedCutoff = new Date('2026-02-02T12:00:00Z');
    expect(callArg.getTime()).toBe(expectedCutoff.getTime());

    jest.useRealTimers();
  });

  it('should notify traveler and agents on auto-close', async () => {
    proxyChatService.findInactiveChats.mockResolvedValue([
      { id: 'pc-1', state: ProxyChatState.OPEN },
    ]);
    proxyChatService.getParticipantTelegramIds.mockResolvedValue({
      travelerTelegramId: BigInt(12345),
      agentTelegramIds: [BigInt(99999), BigInt(88888)],
      agencyGroupChatId: null,
    });

    await processor.process({} as any);

    // Traveler notification
    expect(telegramService.sendRfqToAgency).toHaveBeenCalledWith(
      12345,
      expect.stringContaining('automatically closed'),
      expect.arrayContaining([
        expect.objectContaining({ callbackData: 'chat:reopen:pc-1' }),
      ]),
    );

    // Agent notifications (2 agents)
    expect(telegramService.sendRfqToAgency).toHaveBeenCalledWith(
      99999,
      expect.stringContaining('automatically closed'),
      expect.any(Array),
    );
    expect(telegramService.sendRfqToAgency).toHaveBeenCalledWith(
      88888,
      expect.stringContaining('automatically closed'),
      expect.any(Array),
    );

    // 3 total: 1 traveler + 2 agents
    expect(telegramService.sendRfqToAgency).toHaveBeenCalledTimes(3);
  });

  it('should include reopen button in notifications', async () => {
    proxyChatService.findInactiveChats.mockResolvedValue([
      { id: 'pc-42', state: ProxyChatState.OPEN },
    ]);
    proxyChatService.getParticipantTelegramIds.mockResolvedValue({
      travelerTelegramId: BigInt(12345),
      agentTelegramIds: [],
      agencyGroupChatId: null,
    });

    await processor.process({} as any);

    const buttons = telegramService.sendRfqToAgency.mock.calls[0][2];
    expect(buttons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: expect.stringContaining('Reopen'),
          callbackData: 'chat:reopen:pc-42',
        }),
      ]),
    );
  });

  it('should skip notification when no participants found', async () => {
    proxyChatService.findInactiveChats.mockResolvedValue([
      { id: 'pc-1', state: ProxyChatState.OPEN },
    ]);
    proxyChatService.getParticipantTelegramIds.mockResolvedValue(null);

    await processor.process({} as any);

    expect(proxyChatService.close).toHaveBeenCalledTimes(1);
    expect(telegramService.sendRfqToAgency).not.toHaveBeenCalled();
  });
});

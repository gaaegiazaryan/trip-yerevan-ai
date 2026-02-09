import { ProxyChatCleanupProcessor } from '../proxy-chat-cleanup.processor';
import { ProxyChatStatus } from '@prisma/client';

function createMockProxyChatService() {
  return {
    findInactiveChats: jest.fn().mockResolvedValue([]),
    close: jest.fn(),
  };
}

function createMockAuditLog() {
  return { log: jest.fn() };
}

describe('ProxyChatCleanupProcessor', () => {
  let processor: ProxyChatCleanupProcessor;
  let proxyChatService: ReturnType<typeof createMockProxyChatService>;
  let auditLog: ReturnType<typeof createMockAuditLog>;

  beforeEach(() => {
    proxyChatService = createMockProxyChatService();
    auditLog = createMockAuditLog();
    processor = new ProxyChatCleanupProcessor(
      proxyChatService as any,
      auditLog as any,
    );
  });

  it('should close inactive chats', async () => {
    proxyChatService.findInactiveChats.mockResolvedValue([
      { id: 'pc-1', status: ProxyChatStatus.OPEN },
      { id: 'pc-2', status: ProxyChatStatus.BOOKED },
    ]);

    await processor.process({} as any);

    expect(proxyChatService.close).toHaveBeenCalledTimes(2);
    expect(proxyChatService.close).toHaveBeenCalledWith(
      'pc-1',
      'auto_closed_inactivity',
    );
    expect(proxyChatService.close).toHaveBeenCalledWith(
      'pc-2',
      'auto_closed_inactivity',
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
      { id: 'pc-1', status: ProxyChatStatus.OPEN },
      { id: 'pc-2', status: ProxyChatStatus.OPEN },
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
});

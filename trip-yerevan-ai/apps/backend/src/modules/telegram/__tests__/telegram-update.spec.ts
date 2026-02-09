import { TelegramUpdate } from '../telegram.update';
import { Language, UserRole, UserStatus } from '@prisma/client';

/**
 * Smoke test: exercises the text-message path through TelegramUpdate
 * with fully-mocked dependencies. Catches stale-build mismatches
 * (like `isActiveAgent is not a function`) at test-time.
 */

const MOCK_USER = {
  id: 'user-001',
  telegramId: BigInt(123456),
  firstName: 'John',
  lastName: 'Doe',
  phone: null,
  preferredLanguage: Language.RU,
  role: UserRole.TRAVELER,
  status: UserStatus.ACTIVE,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createMocks() {
  const bot = {
    use: jest.fn(),
    command: jest.fn(),
    on: jest.fn(),
    callbackQuery: jest.fn(),
    catch: jest.fn(),
    start: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn(),
    isRunning: jest.fn().mockReturnValue(false),
  };

  const aiEngine = {
    processMessage: jest.fn().mockResolvedValue({
      conversationId: 'conv-001',
      state: 'COLLECTING',
      textResponse: 'Where would you like to go?',
      suggestedActions: [],
    }),
  };

  const telegramService = {
    sendMessage: jest.fn().mockResolvedValue(undefined),
    sendInlineKeyboard: jest.fn().mockResolvedValue(undefined),
    sendRfqToAgency: jest.fn().mockResolvedValue(undefined),
    sendErrorMessage: jest.fn().mockResolvedValue(undefined),
    sendOfferNotification: jest.fn().mockResolvedValue(undefined),
  };

  const rateLimiter = {
    isRateLimited: jest.fn().mockReturnValue(false),
    cleanup: jest.fn(),
  };

  const userMiddleware = {
    middleware: jest.fn().mockReturnValue(() => {}),
  };

  const offerWizard = {
    hasActiveWizard: jest.fn().mockReturnValue(false),
    startWizard: jest.fn(),
    handleCallback: jest.fn(),
    handleTextInput: jest.fn(),
  };

  const offerViewer = {
    getOfferList: jest.fn(),
    getOfferDetail: jest.fn(),
  };

  const agencyApp = {
    hasActiveWizard: jest.fn().mockReturnValue(false),
    hasPendingRejectReason: jest.fn().mockReturnValue(false),
    startOrResume: jest.fn(),
    handleCallback: jest.fn(),
    handleTextInput: jest.fn(),
    findPendingApplications: jest.fn(),
    getApplicationDetails: jest.fn(),
    approveApplication: jest.fn(),
    setPendingRejectReason: jest.fn(),
  };

  const agenciesService = {
    isActiveMember: jest.fn().mockResolvedValue(false),
  };

  const agencyMgmt = {
    hasActiveAddManager: jest.fn().mockReturnValue(false),
    buildDashboard: jest.fn(),
    startAddManager: jest.fn(),
    cancelAddManager: jest.fn(),
    handleAddManagerInput: jest.fn(),
    setAgencyChat: jest.fn(),
    findActiveAgentTelegramIds: jest.fn(),
  };

  return {
    bot,
    aiEngine,
    telegramService,
    rateLimiter,
    userMiddleware,
    offerWizard,
    offerViewer,
    agencyApp,
    agenciesService,
    agencyMgmt,
  };
}

describe('TelegramUpdate', () => {
  let update: TelegramUpdate;
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    mocks = createMocks();
    update = new TelegramUpdate(
      mocks.bot as any,
      mocks.aiEngine as any,
      mocks.telegramService as any,
      mocks.rateLimiter as any,
      mocks.userMiddleware as any,
      mocks.offerWizard as any,
      mocks.offerViewer as any,
      mocks.agencyApp as any,
      mocks.agenciesService as any,
      mocks.agencyMgmt as any,
    );
  });

  afterEach(async () => {
    // Clean up the rate-limiter interval started in onModuleInit
    await update.onModuleDestroy();
  });

  describe('onModuleInit', () => {
    it('should pass service contract checks and register handlers', async () => {
      await update.onModuleInit();

      expect(mocks.bot.use).toHaveBeenCalled();
      expect(mocks.bot.command).toHaveBeenCalled();
      expect(mocks.bot.on).toHaveBeenCalledWith(
        'message:text',
        expect.any(Function),
      );
      expect(mocks.bot.start).toHaveBeenCalled();
    });

    it('should throw if a critical service method is missing (stale dist)', () => {
      // Simulate stale dist: isActiveMember was renamed but JS still has old name
      (mocks.agenciesService as any).isActiveMember = undefined;

      expect(() => {
        // onModuleInit calls assertServiceContracts synchronously at the top
        // We need to invoke it and catch the sync throw before the async part
        // Since assertServiceContracts is called first, the promise will reject
        return update.onModuleInit();
      }).rejects.toThrow('Service contract broken');
    });

    it('should start polling with drop_pending_updates', async () => {
      await update.onModuleInit();

      expect(mocks.bot.start).toHaveBeenCalledWith(
        expect.objectContaining({ drop_pending_updates: true }),
      );
    });

    it('should auto-restart polling after 409 conflict', async () => {
      jest.useFakeTimers();

      // First call rejects (simulates 409), second call resolves
      mocks.bot.start
        .mockRejectedValueOnce(new Error('409: Conflict'))
        .mockResolvedValueOnce(undefined);

      await update.onModuleInit();

      // First start was called
      expect(mocks.bot.start).toHaveBeenCalledTimes(1);

      // Flush the rejected promise
      await Promise.resolve();
      await Promise.resolve();

      // Advance past the 5s restart delay
      jest.advanceTimersByTime(5000);

      // Flush the restart call
      await Promise.resolve();

      expect(mocks.bot.start).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });

    it('should skip bot setup when bot token is not set', async () => {
      const noBotUpdate = new TelegramUpdate(
        null as any,
        mocks.aiEngine as any,
        mocks.telegramService as any,
        mocks.rateLimiter as any,
        mocks.userMiddleware as any,
        mocks.offerWizard as any,
        mocks.offerViewer as any,
        mocks.agencyApp as any,
        mocks.agenciesService as any,
        mocks.agencyMgmt as any,
      );

      // Should not throw even though bot is null
      await noBotUpdate.onModuleInit();

      expect(mocks.bot.use).not.toHaveBeenCalled();
    });
  });

  describe('handleTextMessage (smoke test)', () => {
    /**
     * Exercises the full text-message path:
     *   ctx → middleware routing → isActiveMember check → aiEngine.processMessage → sendMessage
     *
     * This is the exact path that broke when isActiveAgent was renamed to isActiveMember
     * and the stale dist still called the old method name.
     */
    it('should route a traveler text message through AI and reply', async () => {
      // Register handlers so we can invoke the text handler
      await update.onModuleInit();

      // Extract the text message handler registered via bot.on('message:text', handler)
      const onCall = mocks.bot.on.mock.calls.find(
        (call: any[]) => call[0] === 'message:text',
      );
      expect(onCall).toBeDefined();
      const textHandler = onCall![1];

      const ctx = {
        chat: { id: 12345 },
        message: { text: 'I want to travel to Yerevan' },
        dbUser: MOCK_USER,
      };

      await textHandler(ctx);

      // isActiveMember should be called to check agency status
      expect(mocks.agenciesService.isActiveMember).toHaveBeenCalledWith(
        MOCK_USER.telegramId,
      );

      // AI engine processes the message
      expect(mocks.aiEngine.processMessage).toHaveBeenCalledWith(
        MOCK_USER.id,
        'I want to travel to Yerevan',
      );

      // Response sent back to user
      expect(mocks.telegramService.sendMessage).toHaveBeenCalledWith(
        12345,
        'Where would you like to go?',
      );
    });

    it('should block active agency members from creating travel requests', async () => {
      mocks.agenciesService.isActiveMember.mockResolvedValue(true);

      await update.onModuleInit();

      const onCall = mocks.bot.on.mock.calls.find(
        (call: any[]) => call[0] === 'message:text',
      );
      const textHandler = onCall![1];

      const ctx = {
        chat: { id: 12345 },
        message: { text: 'I want to travel' },
        dbUser: MOCK_USER,
      };

      await textHandler(ctx);

      expect(mocks.agenciesService.isActiveMember).toHaveBeenCalled();
      expect(mocks.aiEngine.processMessage).not.toHaveBeenCalled();
      expect(mocks.telegramService.sendMessage).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('Agency accounts cannot create travel requests'),
      );
    });

    it('should send error message when AI engine throws', async () => {
      mocks.aiEngine.processMessage.mockRejectedValue(
        new Error('AI provider timeout'),
      );

      await update.onModuleInit();

      const onCall = mocks.bot.on.mock.calls.find(
        (call: any[]) => call[0] === 'message:text',
      );
      const textHandler = onCall![1];

      const ctx = {
        chat: { id: 12345 },
        message: { text: 'Hello' },
        dbUser: MOCK_USER,
      };

      await textHandler(ctx);

      expect(mocks.telegramService.sendErrorMessage).toHaveBeenCalledWith(
        12345,
        'RU',
      );
    });
  });
});

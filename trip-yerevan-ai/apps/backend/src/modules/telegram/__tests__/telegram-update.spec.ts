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
    sendMessage: jest.fn().mockResolvedValue(100),
    sendInlineKeyboard: jest.fn().mockResolvedValue(undefined),
    sendRfqToAgency: jest.fn().mockResolvedValue(101),
    sendErrorMessage: jest.fn().mockResolvedValue(undefined),
    sendOfferNotification: jest.fn().mockResolvedValue(undefined),
    editMessageText: jest.fn().mockResolvedValue(undefined),
    deleteMessage: jest.fn().mockResolvedValue(undefined),
    sendMediaGroup: jest.fn().mockResolvedValue(undefined),
    sendDocument: jest.fn().mockResolvedValue(undefined),
    sendReplyKeyboard: jest.fn().mockResolvedValue(200),
    removeReplyKeyboard: jest.fn().mockResolvedValue(201),
    pinMessage: jest.fn().mockResolvedValue(true),
    unpinMessage: jest.fn().mockResolvedValue(true),
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

  const proxyChatSession = {
    hasActiveSession: jest.fn().mockReturnValue(false),
    getSession: jest.fn(),
    exitSession: jest.fn(),
    startTravelerChat: jest.fn(),
    startAgencyReply: jest.fn(),
    startTravelerManagerChat: jest.fn(),
    startManagerChat: jest.fn(),
    handleMessage: jest.fn().mockResolvedValue({ targets: [] }),
    closeChat: jest.fn(),
    getExpiredSessions: jest.fn().mockReturnValue([]),
    touchSession: jest.fn(),
    setPinnedMessageId: jest.fn(),
  };

  const bookingAcceptance = {
    showConfirmation: jest.fn(),
    confirmAcceptance: jest.fn(),
    getManagerChannelChatId: jest.fn().mockReturnValue(null),
  };

  const managerTakeover = {
    onBookingCreated: jest.fn().mockResolvedValue({}),
    claimChat: jest.fn(),
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
    proxyChatSession,
    bookingAcceptance,
    managerTakeover,
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
      mocks.proxyChatSession as any,
      mocks.bookingAcceptance as any,
      mocks.managerTakeover as any,
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
        mocks.proxyChatSession as any,
        mocks.bookingAcceptance as any,
        mocks.managerTakeover as any,
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

    it('should send generic error message when AI engine throws', async () => {
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

      // Generic error — sends error_generic message
      expect(mocks.telegramService.sendMessage).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('Произошла ошибка'),
      );
    });

    it('should send infrastructure error message when InfrastructureException thrown', async () => {
      const { InfrastructureException } = await import(
        '../../../common/exceptions/domain.exception'
      );
      mocks.aiEngine.processMessage.mockRejectedValue(
        new InfrastructureException('API credits exhausted', 'anthropic'),
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

      // Infrastructure error — sends error_infrastructure message
      expect(mocks.telegramService.sendMessage).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('AI-сервис временно недоступен'),
      );
    });
  });

  describe('offers view flow (integration smoke test)', () => {
    function getOffersHandler() {
      const cbCall = mocks.bot.callbackQuery.mock.calls.find(
        (call: any[]) => call[0] instanceof RegExp && call[0].source === '^offers:',
      );
      return cbCall?.[1];
    }

    function makeCallbackCtx(chatId: number, data: string, messageId = 50) {
      return {
        callbackQuery: {
          message: { chat: { id: chatId }, message_id: messageId },
          data,
        },
        answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
        dbUser: MOCK_USER,
      };
    }

    it('should render offers list when view button pressed', async () => {
      await update.onModuleInit();
      const handler = getOffersHandler();
      expect(handler).toBeDefined();

      mocks.offerViewer.getOfferList.mockResolvedValue({
        text: 'Your Offers to Dubai',
        buttons: [
          { label: 'Agency — 1,500 USD', callbackData: 'offers:d:offer-1' },
          { label: 'Close', callbackData: 'offers:close' },
        ],
        totalOffers: 1,
        page: 0,
        totalPages: 1,
        travelRequestId: 'tr-1',
      });

      const ctx = makeCallbackCtx(12345, 'offers:view:tr-1');
      await handler(ctx);

      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
      expect(mocks.offerViewer.getOfferList).toHaveBeenCalledWith(
        'tr-1',
        MOCK_USER.id,
      );
      // Should try to edit the notification message
      expect(mocks.telegramService.editMessageText).toHaveBeenCalled();
    });

    it('should edit message for pagination', async () => {
      await update.onModuleInit();
      const handler = getOffersHandler();

      mocks.offerViewer.getOfferList.mockResolvedValue({
        text: 'Page 2',
        buttons: [
          { label: 'Previous', callbackData: 'offers:p:tr-1:0' },
          { label: 'Close', callbackData: 'offers:close' },
        ],
        totalOffers: 6,
        page: 1,
        totalPages: 2,
        travelRequestId: 'tr-1',
      });

      const ctx = makeCallbackCtx(12345, 'offers:p:tr-1:1', 60);
      await handler(ctx);

      expect(mocks.telegramService.editMessageText).toHaveBeenCalledWith(
        12345,
        60,
        'Page 2',
        expect.any(Array),
      );
    });

    it('should render offer detail and send images', async () => {
      await update.onModuleInit();
      const handler = getOffersHandler();

      mocks.offerViewer.getOfferDetail.mockResolvedValue({
        text: 'Offer from Agency',
        buttons: [
          { label: 'Back', callbackData: 'offers:b:tr-1' },
          { label: 'Ask question', callbackData: 'offers:ask:offer-1' },
          { label: 'Accept offer', callbackData: 'offers:accept:offer-1' },
        ],
        imageFileIds: ['img1', 'img2'],
        documentFileIds: [{ fileId: 'pdf1', fileName: 'trip.pdf' }],
        travelRequestId: 'tr-1',
      });

      const ctx = makeCallbackCtx(12345, 'offers:d:offer-1');
      await handler(ctx);

      expect(mocks.telegramService.sendMediaGroup).toHaveBeenCalledWith(
        12345,
        ['img1', 'img2'],
      );
      expect(mocks.telegramService.sendRfqToAgency).toHaveBeenCalledWith(
        12345,
        'Offer from Agency',
        expect.any(Array),
      );
      expect(mocks.telegramService.sendDocument).toHaveBeenCalledWith(
        12345,
        'pdf1',
        'trip.pdf',
      );
    });

    it('should edit message when going back to list', async () => {
      await update.onModuleInit();
      const handler = getOffersHandler();

      mocks.offerViewer.getOfferList.mockResolvedValue({
        text: 'Your Offers',
        buttons: [{ label: 'Close', callbackData: 'offers:close' }],
        totalOffers: 1,
        page: 0,
        totalPages: 1,
        travelRequestId: 'tr-1',
      });

      const ctx = makeCallbackCtx(12345, 'offers:b:tr-1', 70);
      await handler(ctx);

      expect(mocks.telegramService.editMessageText).toHaveBeenCalledWith(
        12345,
        70,
        'Your Offers',
        expect.any(Array),
      );
    });

    it('should delete message on close', async () => {
      await update.onModuleInit();
      const handler = getOffersHandler();

      const ctx = makeCallbackCtx(12345, 'offers:close', 80);
      await handler(ctx);

      expect(mocks.telegramService.deleteMessage).toHaveBeenCalledWith(
        12345,
        80,
      );
    });

    it('should fall back to new message when edit fails', async () => {
      await update.onModuleInit();
      const handler = getOffersHandler();

      mocks.offerViewer.getOfferList.mockResolvedValue({
        text: 'Your Offers',
        buttons: [{ label: 'Close', callbackData: 'offers:close' }],
        totalOffers: 1,
        page: 0,
        totalPages: 1,
        travelRequestId: 'tr-1',
      });

      // Edit will fail
      mocks.telegramService.editMessageText.mockRejectedValueOnce(
        new Error('message not found'),
      );

      const ctx = makeCallbackCtx(12345, 'offers:view:tr-1', 90);
      await handler(ctx);

      // Should fall back to sendRfqToAgency
      expect(mocks.telegramService.sendRfqToAgency).toHaveBeenCalled();
    });

    it('should start proxy chat when ask button pressed', async () => {
      await update.onModuleInit();
      const handler = getOffersHandler();

      mocks.proxyChatSession.startTravelerChat.mockResolvedValue({
        text: 'You are now chatting...',
        proxyChatId: 'pc-1',
      });
      mocks.proxyChatSession.getSession.mockReturnValue({
        proxyChatId: 'pc-1',
        senderType: 'USER',
        senderId: 'user-001',
        offerId: 'offer-1',
        travelRequestId: 'tr-1',
        counterpartChatIds: [99999],
        senderLabel: 'Traveler',
        chatStatus: 'OPEN',
        isManager: false,
        agencyName: 'TravelCo',
        lastActivityAt: Date.now(),
      });

      const ctx = makeCallbackCtx(12345, 'offers:ask:offer-1');
      await handler(ctx);

      expect(mocks.proxyChatSession.startTravelerChat).toHaveBeenCalledWith(
        12345,
        'offer-1',
        MOCK_USER.id,
      );
      // Sticky session: sends reply keyboard + pins header
      expect(mocks.telegramService.sendReplyKeyboard).toHaveBeenCalledWith(
        12345,
        expect.any(String),
        expect.any(Object),
      );
      expect(mocks.telegramService.pinMessage).toHaveBeenCalledWith(12345, 200);
    });

    it('should show booking confirmation when accept button pressed', async () => {
      await update.onModuleInit();
      const handler = getOffersHandler();

      mocks.bookingAcceptance.showConfirmation.mockResolvedValue({
        text: 'Are you sure?',
        buttons: [
          { label: 'Confirm', callbackData: 'offers:cfm:offer-1' },
          { label: 'Cancel', callbackData: 'offers:cxl' },
        ],
      });

      const ctx = makeCallbackCtx(12345, 'offers:accept:offer-1');
      await handler(ctx);

      expect(mocks.bookingAcceptance.showConfirmation).toHaveBeenCalledWith(
        'offer-1',
        MOCK_USER.id,
      );
      expect(mocks.telegramService.sendRfqToAgency).toHaveBeenCalledWith(
        12345,
        'Are you sure?',
        expect.any(Array),
      );
    });

    it('should create booking and send notifications on confirm', async () => {
      await update.onModuleInit();
      const handler = getOffersHandler();

      mocks.bookingAcceptance.confirmAcceptance.mockResolvedValue({
        text: 'Booking Created!',
        notifications: [
          { chatId: 99999, text: 'Offer Accepted!' },
          { chatId: 88888, text: 'New Booking!' },
        ],
        travelRequestId: 'tr-1',
        bookingId: 'booking-001',
      });

      const ctx = makeCallbackCtx(12345, 'offers:cfm:offer-1');
      await handler(ctx);

      expect(mocks.bookingAcceptance.confirmAcceptance).toHaveBeenCalledWith(
        'offer-1',
        MOCK_USER.id,
      );
      // Traveler gets confirmation
      expect(mocks.telegramService.sendMessage).toHaveBeenCalledWith(
        12345,
        'Booking Created!',
      );
      // Notifications sent
      expect(mocks.telegramService.sendMessage).toHaveBeenCalledWith(
        99999,
        'Offer Accepted!',
      );
      expect(mocks.telegramService.sendMessage).toHaveBeenCalledWith(
        88888,
        'New Booking!',
      );
    });

    it('should delete message on cancel (offers:cxl)', async () => {
      await update.onModuleInit();
      const handler = getOffersHandler();

      const ctx = makeCallbackCtx(12345, 'offers:cxl', 85);
      await handler(ctx);

      expect(mocks.telegramService.deleteMessage).toHaveBeenCalledWith(
        12345,
        85,
      );
    });
  });

  describe('proxy chat text routing', () => {
    it('should route text to proxy chat when session is active', async () => {
      await update.onModuleInit();

      mocks.proxyChatSession.hasActiveSession.mockReturnValue(true);
      mocks.proxyChatSession.handleMessage.mockResolvedValue({
        targets: [
          { chatId: 99999, text: 'Traveler:\nHello', contentType: 'TEXT' },
        ],
      });
      mocks.proxyChatSession.getSession.mockReturnValue({
        proxyChatId: 'pc-1',
        senderType: 'USER',
        senderId: 'user-001',
        offerId: 'offer-1',
        travelRequestId: 'tr-1',
        counterpartChatIds: [99999],
        senderLabel: 'Traveler',
        chatStatus: 'OPEN',
        isManager: false,
        agencyName: 'TravelCo',
        lastActivityAt: Date.now(),
      });

      const onCall = mocks.bot.on.mock.calls.find(
        (call: any[]) => call[0] === 'message:text',
      );
      const textHandler = onCall![1];

      const ctx = {
        chat: { id: 12345 },
        message: { text: 'Hello, what about visa?' },
        dbUser: MOCK_USER,
      };

      await textHandler(ctx);

      // touchSession called (both in handleTextMessage and handleProxyChatMessage)
      expect(mocks.proxyChatSession.touchSession).toHaveBeenCalledWith(12345);

      expect(mocks.proxyChatSession.handleMessage).toHaveBeenCalledWith(
        12345,
        'Hello, what about visa?',
        'TEXT',
        undefined,
      );
      // Should NOT call AI engine
      expect(mocks.aiEngine.processMessage).not.toHaveBeenCalled();
      // Should forward to counterpart
      expect(mocks.telegramService.sendRfqToAgency).toHaveBeenCalledWith(
        99999,
        expect.any(String),
        expect.any(Array),
      );
    });
  });

  describe('chat callback handler', () => {
    function getChatHandler() {
      const cbCall = mocks.bot.callbackQuery.mock.calls.find(
        (call: any[]) => call[0] instanceof RegExp && call[0].source === '^chat:',
      );
      return cbCall?.[1];
    }

    function makeChatCtx(chatId: number, data: string) {
      return {
        callbackQuery: {
          message: { chat: { id: chatId }, message_id: 50 },
          data,
        },
        answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
        dbUser: MOCK_USER,
      };
    }

    it('should start agency reply on chat:reply callback', async () => {
      await update.onModuleInit();
      const handler = getChatHandler();
      expect(handler).toBeDefined();

      mocks.proxyChatSession.startAgencyReply.mockResolvedValue({
        text: 'You are now replying...',
        proxyChatId: 'pc-1',
      });
      mocks.proxyChatSession.getSession.mockReturnValue({
        proxyChatId: 'pc-1',
        senderType: 'AGENCY',
        senderId: 'agent-user-001',
        offerId: 'offer-1',
        travelRequestId: 'tr-1',
        counterpartChatIds: [12345],
        senderLabel: 'TravelCo',
        chatStatus: 'OPEN',
        isManager: false,
        agencyName: 'TravelCo',
        lastActivityAt: Date.now(),
      });

      const ctx = makeChatCtx(99999, 'chat:reply:pc-1');
      await handler(ctx);

      expect(mocks.proxyChatSession.startAgencyReply).toHaveBeenCalledWith(
        99999,
        'pc-1',
        MOCK_USER.telegramId,
      );
      // Sticky session: sends reply keyboard + pins header
      expect(mocks.telegramService.sendReplyKeyboard).toHaveBeenCalledWith(
        99999,
        expect.any(String),
        expect.any(Object),
      );
    });

    it('should close chat on chat:close callback', async () => {
      await update.onModuleInit();
      const handler = getChatHandler();

      mocks.proxyChatSession.getSession.mockReturnValue({
        proxyChatId: 'pc-1',
        senderType: 'USER',
        senderId: 'user-001',
        offerId: 'offer-1',
        travelRequestId: 'tr-1',
        counterpartChatIds: [99999],
        senderLabel: 'Traveler',
        chatStatus: 'OPEN',
        isManager: false,
        agencyName: 'TravelCo',
        pinnedMessageId: 200,
        lastActivityAt: Date.now(),
      });

      const ctx = makeChatCtx(12345, 'chat:close:pc-1');
      await handler(ctx);

      // exitChatSession unpins + removes keyboard
      expect(mocks.telegramService.unpinMessage).toHaveBeenCalledWith(12345, 200);
      expect(mocks.telegramService.removeReplyKeyboard).toHaveBeenCalledWith(
        12345,
        expect.any(String),
      );
      expect(mocks.proxyChatSession.closeChat).toHaveBeenCalledWith(
        12345,
        'pc-1',
      );
    });

    it('should start manager chat on chat:mgr callback', async () => {
      await update.onModuleInit();
      const handler = getChatHandler();

      mocks.proxyChatSession.startTravelerManagerChat.mockResolvedValue({
        text: 'You are chatting with manager...',
        proxyChatId: 'pc-mgr',
      });
      mocks.proxyChatSession.getSession.mockReturnValue({
        proxyChatId: 'pc-mgr',
        senderType: 'USER',
        senderId: 'user-001',
        offerId: 'offer-1',
        travelRequestId: 'tr-1',
        counterpartChatIds: [88888],
        senderLabel: 'Traveler',
        chatStatus: 'OPEN',
        isManager: false,
        agencyName: 'Manager Chat',
        lastActivityAt: Date.now(),
      });

      const ctx = makeChatCtx(12345, 'chat:mgr:pc-mgr');
      await handler(ctx);

      expect(mocks.proxyChatSession.startTravelerManagerChat).toHaveBeenCalledWith(
        12345,
        'pc-mgr',
        MOCK_USER.id,
      );
      expect(mocks.telegramService.sendReplyKeyboard).toHaveBeenCalled();
    });

    it('should exit session and show offer detail on chat:back', async () => {
      await update.onModuleInit();
      const handler = getChatHandler();

      mocks.proxyChatSession.getSession.mockReturnValue({
        proxyChatId: 'pc-1',
        senderType: 'USER',
        senderId: 'user-001',
        offerId: 'offer-1',
        travelRequestId: 'tr-1',
        counterpartChatIds: [99999],
        senderLabel: 'Traveler',
        chatStatus: 'OPEN',
        isManager: false,
        agencyName: 'TravelCo',
        lastActivityAt: Date.now(),
      });

      mocks.offerViewer.getOfferDetail.mockResolvedValue({
        text: 'Offer detail',
        buttons: [{ label: 'Back', callbackData: 'offers:b:tr-1' }],
        imageFileIds: [],
        documentFileIds: [],
        travelRequestId: 'tr-1',
      });

      const ctx = makeChatCtx(12345, 'chat:back:offer-1');
      await handler(ctx);

      // exitChatSession removes keyboard + clears session
      expect(mocks.telegramService.removeReplyKeyboard).toHaveBeenCalledWith(
        12345,
        expect.any(String),
      );
      expect(mocks.proxyChatSession.exitSession).toHaveBeenCalledWith(12345);
      expect(mocks.offerViewer.getOfferDetail).toHaveBeenCalledWith(
        'offer-1',
        MOCK_USER.id,
      );
    });
  });

  describe('keyboard interception', () => {
    function getTextHandler() {
      const onCall = mocks.bot.on.mock.calls.find(
        (call: any[]) => call[0] === 'message:text',
      );
      return onCall![1];
    }

    it('should intercept "❌ Exit chat" and exit session', async () => {
      await update.onModuleInit();
      const textHandler = getTextHandler();

      mocks.proxyChatSession.hasActiveSession.mockReturnValue(true);
      mocks.proxyChatSession.getSession.mockReturnValue({
        proxyChatId: 'pc-1',
        senderType: 'USER',
        senderId: 'user-001',
        offerId: 'offer-1',
        travelRequestId: 'tr-1',
        counterpartChatIds: [99999],
        senderLabel: 'Traveler',
        chatStatus: 'OPEN',
        isManager: false,
        agencyName: 'TravelCo',
        pinnedMessageId: 200,
        lastActivityAt: Date.now(),
      });

      const ctx = {
        chat: { id: 12345 },
        message: { text: '❌ Exit chat' },
        dbUser: MOCK_USER,
      };

      await textHandler(ctx);

      // Should exit session, not forward to proxy chat
      expect(mocks.telegramService.removeReplyKeyboard).toHaveBeenCalledWith(
        12345,
        expect.any(String),
      );
      expect(mocks.telegramService.unpinMessage).toHaveBeenCalledWith(12345, 200);
      expect(mocks.proxyChatSession.exitSession).toHaveBeenCalledWith(12345);
      expect(mocks.proxyChatSession.handleMessage).not.toHaveBeenCalled();
      expect(mocks.aiEngine.processMessage).not.toHaveBeenCalled();
    });

    it('should intercept "📄 Booking details" and show offer detail', async () => {
      await update.onModuleInit();
      const textHandler = getTextHandler();

      mocks.proxyChatSession.hasActiveSession.mockReturnValue(true);
      mocks.proxyChatSession.getSession.mockReturnValue({
        proxyChatId: 'pc-1',
        senderType: 'USER',
        senderId: 'user-001',
        offerId: 'offer-1',
        travelRequestId: 'tr-1',
        counterpartChatIds: [99999],
        senderLabel: 'Traveler',
        chatStatus: 'OPEN',
        isManager: false,
        agencyName: 'TravelCo',
        lastActivityAt: Date.now(),
      });

      mocks.offerViewer.getOfferDetail.mockResolvedValue({
        text: 'Dubai offer details...',
        buttons: [],
        imageFileIds: [],
        documentFileIds: [],
        travelRequestId: 'tr-1',
      });

      const ctx = {
        chat: { id: 12345 },
        message: { text: '📄 Booking details' },
        dbUser: MOCK_USER,
      };

      await textHandler(ctx);

      // Should show offer detail as plain text (stay in chat mode)
      expect(mocks.offerViewer.getOfferDetail).toHaveBeenCalledWith(
        'offer-1',
        'user-001',
      );
      expect(mocks.telegramService.sendMessage).toHaveBeenCalledWith(
        12345,
        'Dubai offer details...',
      );
      // Should NOT exit session
      expect(mocks.proxyChatSession.exitSession).not.toHaveBeenCalled();
      expect(mocks.proxyChatSession.handleMessage).not.toHaveBeenCalled();
    });

    it('should intercept "🆘 Contact manager" and send escalation', async () => {
      await update.onModuleInit();
      const textHandler = getTextHandler();

      mocks.proxyChatSession.hasActiveSession.mockReturnValue(true);
      mocks.proxyChatSession.getSession.mockReturnValue({
        proxyChatId: 'pc-1',
        senderType: 'USER',
        senderId: 'user-001',
        offerId: 'offer-1',
        travelRequestId: 'tr-1',
        counterpartChatIds: [99999],
        senderLabel: 'Traveler',
        chatStatus: 'OPEN',
        isManager: false,
        agencyName: 'TravelCo',
        lastActivityAt: Date.now(),
      });
      mocks.bookingAcceptance.getManagerChannelChatId.mockReturnValue(777);

      const ctx = {
        chat: { id: 12345 },
        message: { text: '🆘 Contact manager' },
        dbUser: MOCK_USER,
      };

      await textHandler(ctx);

      // Should send notification to manager channel
      expect(mocks.telegramService.sendMessage).toHaveBeenCalledWith(
        777,
        expect.stringContaining('Manager Assistance'),
      );
      // Should confirm to user
      expect(mocks.telegramService.sendMessage).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('Manager assistance request sent'),
      );
      // Should NOT exit session
      expect(mocks.proxyChatSession.exitSession).not.toHaveBeenCalled();
    });
  });

  describe('/start exits active chat session', () => {
    it('should exit chat session when /start is issued during active chat', async () => {
      await update.onModuleInit();

      mocks.proxyChatSession.hasActiveSession.mockReturnValue(true);
      mocks.proxyChatSession.getSession.mockReturnValue({
        proxyChatId: 'pc-1',
        senderType: 'USER',
        senderId: 'user-001',
        offerId: 'offer-1',
        travelRequestId: 'tr-1',
        counterpartChatIds: [99999],
        senderLabel: 'Traveler',
        chatStatus: 'OPEN',
        isManager: false,
        agencyName: 'TravelCo',
        pinnedMessageId: 200,
        lastActivityAt: Date.now(),
      });

      // Extract the /start handler
      const cmdCall = mocks.bot.command.mock.calls.find(
        (call: any[]) => call[0] === 'start',
      );
      expect(cmdCall).toBeDefined();
      const startHandler = cmdCall![1];

      const ctx = {
        chat: { id: 12345 },
        dbUser: MOCK_USER,
      };

      await startHandler(ctx);

      // Should exit chat session first
      expect(mocks.telegramService.unpinMessage).toHaveBeenCalledWith(12345, 200);
      expect(mocks.telegramService.removeReplyKeyboard).toHaveBeenCalledWith(
        12345,
        expect.any(String),
      );
      expect(mocks.proxyChatSession.exitSession).toHaveBeenCalledWith(12345);
      // Should still send welcome message
      expect(mocks.telegramService.sendMessage).toHaveBeenCalledWith(
        12345,
        expect.any(String),
      );
    });
  });

  describe('session timeout cleanup', () => {
    it('should clean up expired sessions on interval', async () => {
      jest.useFakeTimers();

      mocks.proxyChatSession.getExpiredSessions.mockReturnValue([
        {
          chatId: 12345,
          session: {
            proxyChatId: 'pc-1',
            senderType: 'USER',
            senderId: 'user-001',
            offerId: 'offer-1',
            travelRequestId: 'tr-1',
            counterpartChatIds: [99999],
            senderLabel: 'Traveler',
            chatStatus: 'OPEN',
            isManager: false,
            agencyName: 'TravelCo',
            pinnedMessageId: 200,
            lastActivityAt: Date.now() - 31 * 60 * 1000,
          },
        },
      ]);

      await update.onModuleInit();

      // Advance past the cleanup interval (5 minutes)
      jest.advanceTimersByTime(5 * 60 * 1000);

      // Flush all async work from cleanupExpiredSessions → exitChatSession chain
      for (let i = 0; i < 10; i++) await Promise.resolve();

      expect(mocks.proxyChatSession.getExpiredSessions).toHaveBeenCalled();
      expect(mocks.telegramService.removeReplyKeyboard).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('inactivity'),
      );
      expect(mocks.proxyChatSession.exitSession).toHaveBeenCalledWith(12345);

      jest.useRealTimers();
    });
  });
});

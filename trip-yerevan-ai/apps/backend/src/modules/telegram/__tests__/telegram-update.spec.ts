import { TelegramUpdate } from '../telegram.update';
import { Language, UserRole, UserStatus } from '@prisma/client';

/**
 * Smoke test: exercises text-message, offer-view, and direct manager link flows
 * through TelegramUpdate with fully-mocked dependencies.
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
    sendMessageWithUrlButton: jest.fn().mockResolvedValue(102),
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

  const bookingAcceptance = {
    showConfirmation: jest.fn(),
    confirmAcceptance: jest.fn(),
    getManagerChannelChatId: jest.fn().mockReturnValue(null),
  };

  const bookingCallbackHandler = {
    handleCallback: jest.fn().mockResolvedValue({ text: 'OK', notifications: [] }),
  };

  const meetingCallbackHandler = {
    handleCallback: jest.fn().mockResolvedValue({ text: 'OK', notifications: [] }),
  };

  const proposalWizard = {
    isActive: jest.fn().mockReturnValue(false),
    start: jest.fn().mockReturnValue({ text: 'Select date', buttons: [] }),
    handleCallback: jest.fn().mockReturnValue({ text: 'OK', buttons: [] }),
    handleTextInput: jest.fn().mockReturnValue({ text: 'OK', buttons: [] }),
    cancel: jest.fn(),
    getState: jest.fn().mockReturnValue(undefined),
  };

  const proposalCallbackHandler = {
    handleCallback: jest.fn().mockResolvedValue({ text: 'OK', notifications: [] }),
  };

  const proposalService = {
    createProposal: jest.fn().mockResolvedValue({ success: true, proposalId: 'prop-1', notifications: [] }),
    counterProposal: jest.fn().mockResolvedValue({ success: true, proposalId: 'prop-2', notifications: [] }),
    buildProposalNotifications: jest.fn().mockResolvedValue([]),
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
    bookingAcceptance,
    bookingCallbackHandler,
    meetingCallbackHandler,
    proposalWizard,
    proposalCallbackHandler,
    proposalService,
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
      mocks.bookingAcceptance as any,
      mocks.bookingCallbackHandler as any,
      mocks.meetingCallbackHandler as any,
      mocks.proposalWizard as any,
      mocks.proposalCallbackHandler as any,
      mocks.proposalService as any,
      mocks.managerTakeover as any,
    );
  });

  afterEach(async () => {
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
      (mocks.agenciesService as any).isActiveMember = undefined;

      expect(() => {
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

      mocks.bot.start
        .mockRejectedValueOnce(new Error('409: Conflict'))
        .mockResolvedValueOnce(undefined);

      await update.onModuleInit();

      expect(mocks.bot.start).toHaveBeenCalledTimes(1);

      await Promise.resolve();
      await Promise.resolve();

      jest.advanceTimersByTime(5000);

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
        mocks.bookingAcceptance as any,
        mocks.bookingCallbackHandler as any,
        mocks.meetingCallbackHandler as any,
        mocks.proposalWizard as any,
        mocks.proposalCallbackHandler as any,
        mocks.proposalService as any,
        mocks.managerTakeover as any,
      );

      await noBotUpdate.onModuleInit();

      expect(mocks.bot.use).not.toHaveBeenCalled();
    });
  });

  describe('handleTextMessage (smoke test)', () => {
    it('should route a traveler text message through AI and reply', async () => {
      await update.onModuleInit();

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

      expect(mocks.agenciesService.isActiveMember).toHaveBeenCalledWith(
        MOCK_USER.telegramId,
      );

      expect(mocks.aiEngine.processMessage).toHaveBeenCalledWith(
        MOCK_USER.id,
        'I want to travel to Yerevan',
      );

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
          { label: 'Ask manager', callbackData: 'offers:ask:offer-1' },
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

      mocks.telegramService.editMessageText.mockRejectedValueOnce(
        new Error('message not found'),
      );

      const ctx = makeCallbackCtx(12345, 'offers:view:tr-1', 90);
      await handler(ctx);

      expect(mocks.telegramService.sendRfqToAgency).toHaveBeenCalled();
    });

    it('should send direct manager link when ask button pressed', async () => {
      await update.onModuleInit();
      const handler = getOffersHandler();

      const ctx = makeCallbackCtx(12345, 'offers:ask:offer-1');
      await handler(ctx);

      // Should send message with URL button (direct Telegram link)
      expect(
        mocks.telegramService.sendMessageWithUrlButton,
      ).toHaveBeenCalledWith(
        12345,
        expect.stringContaining('менеджеру'),
        expect.stringContaining('менеджеру'),
        'https://t.me/tm_harutyunyan',
      );

      // Should NOT create support threads or wait for text input
      expect(mocks.aiEngine.processMessage).not.toHaveBeenCalled();
    });

    it('should NOT intercept next text message after ask button (no pending state)', async () => {
      await update.onModuleInit();
      const handler = getOffersHandler();

      // Click "Ask manager"
      const askCtx = makeCallbackCtx(12345, 'offers:ask:offer-1');
      await handler(askCtx);

      // Next text message should go to AI engine, not be intercepted
      const textHandler = mocks.bot.on.mock.calls.find(
        (call: any[]) => call[0] === 'message:text',
      )![1];

      await textHandler({
        chat: { id: 12345 },
        message: { text: 'I want to go to Paris' },
        dbUser: MOCK_USER,
      });

      expect(mocks.aiEngine.processMessage).toHaveBeenCalledWith(
        'user-001',
        'I want to go to Paris',
      );
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
      expect(mocks.telegramService.sendMessage).toHaveBeenCalledWith(
        12345,
        'Booking Created!',
      );
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
});

import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { TELEGRAM_BOT, TelegramBot } from './telegram-bot.provider';
import { AiEngineService } from '../ai/services/ai-engine.service';
import { TelegramService } from './telegram.service';
import { TelegramRateLimiter } from './telegram-rate-limiter';
import { TelegramUserMiddleware } from './telegram-user.middleware';
import { OfferWizardService } from '../offers/offer-wizard.service';
import { isOfferSubmitResult } from '../offers/offer-wizard.types';
import { OfferViewerService, OfferDetailResult } from '../offers/offer-viewer.service';
import { AgencyApplicationService } from '../agencies/agency-application.service';
import { AgenciesService } from '../agencies/agencies.service';
import { AgencyManagementService } from '../agencies/agency-management.service';
import {
  ProxyChatSessionService,
  ProxyChatSession,
} from '../proxy-chat/proxy-chat-session.service';
import { BookingAcceptanceService } from '../bookings/booking-acceptance.service';
import { ManagerTakeoverService } from '../proxy-chat/manager-takeover.service';
import {
  CHAT_KEYBOARD_LABELS,
  KB_EXIT_CHAT,
  KB_BOOKING_DETAILS,
  KB_CHAT_DETAILS,
  KB_CONTACT_MANAGER,
  SESSION_TIMEOUT_MS,
  SESSION_CLEANUP_INTERVAL_MS,
} from '../proxy-chat/proxy-chat.constants';
import {
  buildTravelerKeyboard,
  buildAgencyKeyboard,
  buildManagerKeyboard,
} from '../proxy-chat/proxy-chat-keyboard';
import {
  getTelegramMessage,
  getChatHeaderMessage,
  prismaLanguageToSupported,
} from './telegram-messages';
import type { ChatHeaderKey } from './telegram-messages';
import { SupportedLanguage } from '../ai/types';
import { InfrastructureException } from '../../common/exceptions/domain.exception';
import { MessageContentType, MessageSenderType, UserRole } from '@prisma/client';
import { BotContext } from './telegram-context';
import type { Keyboard } from 'grammy';

@Injectable()
export class TelegramUpdate implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramUpdate.name);
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private sessionTimeoutInterval: ReturnType<typeof setInterval> | null = null;
  private stopping = false;

  /** Tracks the last offers-UI message per chat for edit-first strategy */
  private readonly offersMsgId = new Map<number, number>();

  constructor(
    @Inject(TELEGRAM_BOT) private readonly bot: TelegramBot,
    private readonly aiEngine: AiEngineService,
    private readonly telegramService: TelegramService,
    private readonly rateLimiter: TelegramRateLimiter,
    private readonly userMiddleware: TelegramUserMiddleware,
    private readonly offerWizard: OfferWizardService,
    private readonly offerViewer: OfferViewerService,
    private readonly agencyApp: AgencyApplicationService,
    private readonly agenciesService: AgenciesService,
    private readonly agencyMgmt: AgencyManagementService,
    private readonly proxyChatSession: ProxyChatSessionService,
    private readonly bookingAcceptance: BookingAcceptanceService,
    private readonly managerTakeover: ManagerTakeoverService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Fail fast if compiled JS is out of sync with source (stale dist guard)
    this.assertServiceContracts();

    if (!this.bot) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not set, bot will not start');
      return;
    }

    this.logger.log('Registering Telegram bot handlers');

    // Global middleware: resolve database user for every update
    this.bot.use(this.userMiddleware.middleware());

    this.bot.command('start', (ctx) => this.handleStart(ctx));
    this.bot.command('agency', (ctx) => this.handleAgencyCommand(ctx));
    this.bot.command('set_agency_chat', (ctx) =>
      this.handleSetAgencyChatCommand(ctx),
    );
    this.bot.command('add_manager', (ctx) =>
      this.handleAddManagerCommand(ctx),
    );
    this.bot.command('review_agencies', (ctx) =>
      this.handleReviewCommand(ctx),
    );
    this.bot.on('message:text', (ctx) => this.handleTextMessage(ctx));
    this.bot.on('message:photo', (ctx) => this.handlePhotoMessage(ctx));
    this.bot.on('message:document', (ctx) => this.handleDocumentMessage(ctx));
    this.bot.callbackQuery(/^action:/, (ctx) =>
      this.handleCallbackQuery(ctx),
    );
    this.bot.callbackQuery(/^offers:/, (ctx) =>
      this.handleOffersViewCallback(ctx),
    );
    this.bot.callbackQuery(/^(rfq:|offer:)/, (ctx) =>
      this.handleOfferCallback(ctx),
    );
    this.bot.callbackQuery(/^mgmt:/, (ctx) =>
      this.handleManagementCallback(ctx),
    );
    this.bot.callbackQuery(/^(agency:|review:)/, (ctx) =>
      this.handleAgencyCallback(ctx),
    );
    this.bot.callbackQuery(/^chat:/, (ctx) =>
      this.handleChatCallback(ctx),
    );
    this.bot.callbackQuery(/^mgr:/, (ctx) =>
      this.handleManagerCallback(ctx),
    );

    this.bot.catch((err) => {
      this.logger.error(`Bot error: ${err.message}`, err.stack);
    });

    this.startPolling();

    this.cleanupInterval = setInterval(() => {
      this.rateLimiter.cleanup();
    }, 60_000);

    // Periodic proxy chat session timeout sweep
    this.sessionTimeoutInterval = setInterval(() => {
      this.cleanupExpiredSessions();
    }, SESSION_CLEANUP_INTERVAL_MS);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.sessionTimeoutInterval) {
      clearInterval(this.sessionTimeoutInterval);
    }
    if (this.bot) {
      this.bot.stop();
      this.logger.log('Telegram bot stopped');
    }
  }

  private startPolling(): void {
    if (!this.bot) return;
    this.logger.log('Starting Telegram bot polling');

    this.bot.start({
      drop_pending_updates: true,
      onStart: () => {
        this.logger.log('Telegram bot is now receiving updates');
      },
    }).catch((err) => {
      if (this.stopping) return;

      this.logger.error(
        `Bot polling stopped: ${err.message}`,
        err instanceof Error ? err.stack : undefined,
      );

      // Auto-restart after transient errors (e.g., 409 conflict)
      const delaySec = 5;
      this.logger.log(`Restarting bot polling in ${delaySec}s...`);
      setTimeout(() => {
        if (!this.stopping) {
          this.startPolling();
        }
      }, delaySec * 1000);
    });
  }

  // ---------------------------------------------------------------------------
  // /start
  // ---------------------------------------------------------------------------
  private async handleStart(ctx: BotContext): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId || !ctx.dbUser) return;

    // Exit chat mode if active
    if (this.proxyChatSession.hasActiveSession(chatId)) {
      const session = this.proxyChatSession.getSession(chatId);
      if (session) {
        await this.exitChatSession(chatId, session, 'start');
      }
    }

    this.logger.log(`[/start] telegramId=${ctx.dbUser.telegramId}, chatId=${chatId}`);

    try {
      const language = prismaLanguageToSupported(ctx.dbUser.preferredLanguage);

      const isNew = ctx.dbUser.createdAt.getTime() > Date.now() - 5000;
      const messageKey = isNew ? 'welcome' : 'welcome_returning';

      await this.telegramService.sendMessage(
        chatId,
        getTelegramMessage(messageKey, language),
      );
    } catch (error) {
      this.logger.error(
        `[/start] Error for telegramId=${ctx.dbUser.telegramId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.safeReply(chatId, 'RU', 'generic');
    }
  }

  // ---------------------------------------------------------------------------
  // Text message
  // ---------------------------------------------------------------------------
  private async handleTextMessage(ctx: BotContext): Promise<void> {
    const chatId = ctx.chat?.id;
    const text = ctx.message?.text;
    if (!chatId || !text) return;

    // Route to proxy chat if session is active
    if (this.proxyChatSession.hasActiveSession(chatId)) {
      // Intercept reply-keyboard button presses
      if (CHAT_KEYBOARD_LABELS.has(text)) {
        await this.handleChatKeyboardPress(chatId, text);
        return;
      }
      this.proxyChatSession.touchSession(chatId);
      await this.handleProxyChatMessage(chatId, text, MessageContentType.TEXT);
      return;
    }

    // Route to add-manager flow if active
    if (this.agencyMgmt.hasActiveAddManager(chatId)) {
      await this.handleAddManagerText(ctx, chatId);
      return;
    }

    // Route to agency wizard / rejection reason if active
    if (this.agencyApp.hasActiveWizard(chatId) || this.agencyApp.hasPendingRejectReason(chatId)) {
      await this.handleAgencyWizardText(chatId, text);
      return;
    }

    // Route to offer wizard if one is active for this chat
    if (this.offerWizard.hasActiveWizard(chatId)) {
      await this.handleOfferWizardText(ctx, chatId, text);
      return;
    }

    if (!ctx.dbUser) {
      await this.telegramService.sendMessage(
        chatId,
        getTelegramMessage('error_not_registered', 'RU'),
      );
      return;
    }

    const telegramId = ctx.dbUser.telegramId;

    if (this.rateLimiter.isRateLimited(telegramId)) {
      this.logger.debug(`[rate-limited] telegramId=${telegramId}`);
      const lang = prismaLanguageToSupported(ctx.dbUser.preferredLanguage);
      await this.telegramService.sendMessage(
        chatId,
        getTelegramMessage('rate_limited', lang),
      );
      return;
    }

    this.logger.log(
      `[message] telegramId=${telegramId}, chatId=${chatId}, length=${text.length}`,
    );

    try {
      // Block agency agents from creating travel requests
      this.logger.debug(`[debug] step=isActiveMember telegramId=${telegramId}`);
      if (await this.agenciesService.isActiveMember(telegramId)) {
        await this.telegramService.sendMessage(
          chatId,
          'Agency accounts cannot create travel requests. Use /agency for agency features.',
        );
        return;
      }

      const language = prismaLanguageToSupported(ctx.dbUser.preferredLanguage);
      this.logger.debug(
        `[debug] step=processMessage userId=${ctx.dbUser.id} lang=${language} textLen=${text.length}`,
      );

      const response = await this.aiEngine.processMessage(ctx.dbUser.id, text);

      this.logger.log(
        `[ai-response] conversationId=${response.conversationId}, ` +
          `state=${response.state}, actions=${response.suggestedActions.length}`,
      );

      this.logger.debug(
        `[debug] step=sendResponse chatId=${chatId} ` +
          `hasActions=${response.suggestedActions.length > 0} ` +
          `textLen=${response.textResponse.length}`,
      );

      if (response.suggestedActions.length > 0) {
        await this.telegramService.sendInlineKeyboard(
          chatId,
          response.textResponse,
          response.suggestedActions,
        );
      } else {
        await this.telegramService.sendMessage(chatId, response.textResponse);
      }
      this.logger.debug(`[debug] step=done chatId=${chatId}`);
    } catch (error) {
      const isInfra = error instanceof InfrastructureException;
      this.logger.error(
        `[message] EXCEPTION for telegramId=${telegramId}, type=${isInfra ? 'infrastructure' : 'unknown'}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      const lang = prismaLanguageToSupported(ctx.dbUser.preferredLanguage);
      await this.safeReply(chatId, lang, isInfra ? 'infrastructure' : 'generic');
    }
  }

  // ---------------------------------------------------------------------------
  // Callback query (inline keyboard buttons)
  // ---------------------------------------------------------------------------
  private async handleCallbackQuery(ctx: BotContext): Promise<void> {
    const chatId = ctx.callbackQuery?.message?.chat.id;
    const data = ctx.callbackQuery?.data;
    if (!chatId || !data) return;

    await ctx.answerCallbackQuery().catch(() => {});

    if (!ctx.dbUser) {
      await this.telegramService.sendMessage(
        chatId,
        getTelegramMessage('error_not_registered', 'RU'),
      );
      return;
    }

    this.logger.log(`[callback] telegramId=${ctx.dbUser.telegramId}, data=${data}`);

    try {
      const syntheticMessage = this.mapCallbackToMessage(data);
      const response = await this.aiEngine.processMessage(
        ctx.dbUser.id,
        syntheticMessage,
      );

      this.logger.log(
        `[ai-response] conversationId=${response.conversationId}, ` +
          `state=${response.state}, actions=${response.suggestedActions.length}`,
      );

      if (response.suggestedActions.length > 0) {
        await this.telegramService.sendInlineKeyboard(
          chatId,
          response.textResponse,
          response.suggestedActions,
        );
      } else {
        await this.telegramService.sendMessage(chatId, response.textResponse);
      }
    } catch (error) {
      const isInfra = error instanceof InfrastructureException;
      this.logger.error(
        `[callback] Error for telegramId=${ctx.dbUser.telegramId}, type=${isInfra ? 'infrastructure' : 'unknown'}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      const lang = prismaLanguageToSupported(ctx.dbUser.preferredLanguage);
      await this.safeReply(chatId, lang, isInfra ? 'infrastructure' : 'generic');
    }
  }

  // ---------------------------------------------------------------------------
  // Offer wizard handlers
  // ---------------------------------------------------------------------------

  private async handleOfferCallback(ctx: BotContext): Promise<void> {
    const chatId = ctx.callbackQuery?.message?.chat.id;
    const data = ctx.callbackQuery?.data;
    if (!chatId || !data) return;

    await ctx.answerCallbackQuery().catch(() => {});

    this.logger.log(`[offer-callback] chatId=${chatId}, data=${data}`);

    try {
      // rfq:offer:<travelRequestId> → start wizard
      if (data.startsWith('rfq:offer:')) {
        const travelRequestId = data.replace('rfq:offer:', '');
        if (!ctx.dbUser) return;
        const result = await this.offerWizard.startWizard(
          chatId,
          travelRequestId,
          ctx.dbUser.telegramId,
        );
        await this.sendWizardResponse(chatId, result);
        return;
      }

      // rfq:reject:<travelRequestId> → stub
      if (data.startsWith('rfq:reject:')) {
        await this.telegramService.sendMessage(
          chatId,
          'RFQ rejected. Thank you for your response.',
        );
        return;
      }

      // offer:* → delegate to wizard service
      const result = await this.offerWizard.handleCallback(chatId, data);

      // If offer was submitted, notify the traveler
      if (isOfferSubmitResult(result) && result.offerId) {
        await this.sendWizardResponse(chatId, result);

        if (result.travelerTelegramId !== BigInt(0)) {
          await this.telegramService.sendOfferNotification(
            Number(result.travelerTelegramId),
            result.travelRequestId,
          );
        }
        return;
      }

      await this.sendWizardResponse(chatId, result);
    } catch (error) {
      this.logger.error(
        `[offer-callback] Error chatId=${chatId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.telegramService
        .sendMessage(chatId, 'Something went wrong. Please try again.')
        .catch(() => {});
    }
  }

  private async handleOfferWizardText(
    ctx: BotContext,
    chatId: number,
    text: string,
  ): Promise<void> {
    try {
      const result = await this.offerWizard.handleTextInput(chatId, text);
      await this.sendWizardResponse(chatId, result);
    } catch (error) {
      this.logger.error(
        `[offer-wizard-text] Error chatId=${chatId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.telegramService
        .sendMessage(chatId, 'Something went wrong. Please try again.')
        .catch(() => {});
    }
  }

  private async handlePhotoMessage(ctx: BotContext): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const photos = ctx.message?.photo;
    if (!photos || photos.length === 0) return;
    const largest = photos[photos.length - 1];

    // Route to proxy chat if session is active
    if (this.proxyChatSession.hasActiveSession(chatId)) {
      await this.handleProxyChatMessage(
        chatId,
        ctx.message?.caption ?? 'Photo',
        MessageContentType.PHOTO,
        largest.file_id,
      );
      return;
    }

    if (!this.offerWizard.isOnAttachmentsStep(chatId)) return;

    // Use the largest photo (last in array)
    const result = this.offerWizard.handleAttachment(chatId, {
      type: 'HOTEL_IMAGE',
      telegramFileId: largest.file_id,
    });
    await this.sendWizardResponse(chatId, result);
  }

  private async handleDocumentMessage(ctx: BotContext): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    const doc = ctx.message?.document;
    if (!doc) return;

    // Route to proxy chat if session is active
    if (this.proxyChatSession.hasActiveSession(chatId)) {
      await this.handleProxyChatMessage(
        chatId,
        ctx.message?.caption ?? doc.file_name ?? 'Document',
        MessageContentType.DOCUMENT,
        doc.file_id,
      );
      return;
    }

    if (!this.offerWizard.isOnAttachmentsStep(chatId)) return;

    const mimeType = doc.mime_type;
    const isPdf = mimeType === 'application/pdf';
    const result = this.offerWizard.handleAttachment(chatId, {
      type: isPdf ? 'ITINERARY_PDF' : 'OTHER',
      telegramFileId: doc.file_id,
      fileName: doc.file_name ?? undefined,
      mimeType: mimeType ?? undefined,
    });
    await this.sendWizardResponse(chatId, result);
  }

  private async sendWizardResponse(
    chatId: number,
    result: { text: string; buttons?: { label: string; callbackData: string }[] },
  ): Promise<void> {
    if (result.buttons && result.buttons.length > 0) {
      await this.telegramService.sendRfqToAgency(chatId, result.text, result.buttons);
    } else {
      await this.telegramService.sendMessage(chatId, result.text);
    }
  }

  // ---------------------------------------------------------------------------
  // Offer viewing handlers (traveler-facing)
  // ---------------------------------------------------------------------------

  private async handleOffersViewCallback(ctx: BotContext): Promise<void> {
    const chatId = ctx.callbackQuery?.message?.chat.id;
    const messageId = ctx.callbackQuery?.message?.message_id;
    const data = ctx.callbackQuery?.data;
    if (!chatId || !data) return;

    await ctx.answerCallbackQuery().catch(() => {});

    if (!ctx.dbUser) {
      await this.telegramService.sendMessage(
        chatId,
        getTelegramMessage('error_not_registered', 'RU'),
      );
      return;
    }

    const userId = ctx.dbUser.id;
    const telegramId = ctx.dbUser.telegramId;

    this.logger.log(
      `[offers-view] action=callback, chatId=${chatId}, telegramId=${telegramId}, userId=${userId}, data=${data}`,
    );

    try {
      // offers:close → delete the offers message
      if (data === 'offers:close') {
        this.logger.log(
          `[offers-view] action=close, chatId=${chatId}, userId=${userId}`,
        );
        if (messageId) {
          await this.telegramService.deleteMessage(chatId, messageId);
        }
        this.offersMsgId.delete(chatId);
        return;
      }

      // offers:ask:{offerId} → start proxy chat with sticky session
      if (data.startsWith('offers:ask:')) {
        const offerId = data.replace('offers:ask:', '');
        this.logger.log(
          `[offers-view] action=ask_question, chatId=${chatId}, userId=${userId}, offerId=${offerId}`,
        );

        const result = await this.proxyChatSession.startTravelerChat(
          chatId,
          offerId,
          userId,
        );

        if (result.proxyChatId) {
          const session = this.proxyChatSession.getSession(chatId);
          if (session) {
            const language = prismaLanguageToSupported(ctx.dbUser!.preferredLanguage);
            await this.enterChatSession(chatId, session, language);
          }
        } else {
          await this.telegramService.sendMessage(chatId, result.text);
        }
        return;
      }

      // offers:accept:{offerId} → show confirmation
      if (data.startsWith('offers:accept:')) {
        const offerId = data.replace('offers:accept:', '');
        this.logger.log(
          `[offers-view] action=accept_offer, chatId=${chatId}, userId=${userId}, offerId=${offerId}`,
        );

        const result = await this.bookingAcceptance.showConfirmation(
          offerId,
          userId,
        );

        await this.sendWizardResponse(chatId, result);
        return;
      }

      // offers:cfm:{offerId} → confirm acceptance
      if (data.startsWith('offers:cfm:')) {
        const offerId = data.replace('offers:cfm:', '');
        this.logger.log(
          `[offers-view] action=confirm_accept, chatId=${chatId}, userId=${userId}, offerId=${offerId}`,
        );

        const result = await this.bookingAcceptance.confirmAcceptance(
          offerId,
          userId,
        );

        await this.telegramService.sendMessage(chatId, result.text);

        // Send booking notifications to agency/agent
        for (const notification of result.notifications) {
          await this.telegramService
            .sendMessage(notification.chatId, notification.text)
            .catch((err) => {
              this.logger.error(
                `[booking-notify] Failed to send to chatId=${notification.chatId}: ${err}`,
              );
            });
        }

        // Trigger manager takeover flow (transition chats to BOOKED, notify manager channel)
        if (result.bookingId) {
          const takeoverResult = await this.managerTakeover.onBookingCreated(
            result.travelRequestId,
            result.bookingId,
            this.bookingAcceptance.getManagerChannelChatId() ?? undefined,
          );

          if (takeoverResult.managerChannelNotification) {
            const notif = takeoverResult.managerChannelNotification;
            if (notif.buttons && notif.buttons.length > 0) {
              await this.telegramService.sendRfqToAgency(
                notif.chatId,
                notif.text,
                notif.buttons,
              ).catch((err) => {
                this.logger.error(
                  `[manager-takeover] Failed to send to manager channel: ${err}`,
                );
              });
            } else {
              await this.telegramService
                .sendMessage(notif.chatId, notif.text)
                .catch((err) => {
                  this.logger.error(
                    `[manager-takeover] Failed to send to manager channel: ${err}`,
                  );
                });
            }
          }
        }
        return;
      }

      // offers:cxl → cancel/dismiss
      if (data === 'offers:cxl') {
        if (messageId) {
          await this.telegramService.deleteMessage(chatId, messageId);
        }
        return;
      }

      // offers:view:{travelRequestId} → initial list (EDIT notification msg, fallback NEW)
      if (data.startsWith('offers:view:')) {
        const travelRequestId = data.replace('offers:view:', '');
        this.logger.log(
          `[offers-view] action=view_list, chatId=${chatId}, userId=${userId}, requestId=${travelRequestId}`,
        );

        const result = await this.offerViewer.getOfferList(
          travelRequestId,
          userId,
        );

        if (!result.buttons) {
          await this.telegramService.sendMessage(chatId, result.text);
          return;
        }

        // Try edit the notification message, fall back to new
        const newMsgId = await this.editOrSend(chatId, messageId, result.text, result.buttons);
        if (newMsgId) this.offersMsgId.set(chatId, newMsgId);
        return;
      }

      // offers:p:{travelRequestId}:{page} → pagination (EDIT message)
      if (data.startsWith('offers:p:')) {
        const parts = data.replace('offers:p:', '').split(':');
        const travelRequestId = parts[0];
        const page = parseInt(parts[1], 10) || 0;

        this.logger.log(
          `[offers-view] action=paginate, chatId=${chatId}, userId=${userId}, requestId=${travelRequestId}, page=${page}`,
        );

        const result = await this.offerViewer.getOfferList(
          travelRequestId,
          userId,
          page,
        );

        if (!result.buttons) {
          await this.telegramService.sendMessage(chatId, result.text);
          return;
        }

        const newMsgId = await this.editOrSend(chatId, messageId, result.text, result.buttons);
        if (newMsgId) this.offersMsgId.set(chatId, newMsgId);
        return;
      }

      // offers:d:{offerId} → detail view
      if (data.startsWith('offers:d:')) {
        const offerId = data.replace('offers:d:', '');

        this.logger.log(
          `[offers-view] action=view_detail, chatId=${chatId}, userId=${userId}, offerId=${offerId}`,
        );

        const result = await this.offerViewer.getOfferDetail(
          offerId,
          userId,
        );

        if (!result.buttons) {
          await this.telegramService.sendMessage(chatId, result.text);
          return;
        }

        const detail = result as OfferDetailResult;

        // If images exist, send them first, then send detail as NEW message
        if (detail.imageFileIds.length > 0) {
          await this.telegramService.sendMediaGroup(chatId, detail.imageFileIds);
          const newMsgId = await this.telegramService.sendRfqToAgency(
            chatId,
            detail.text,
            detail.buttons,
          );
          if (newMsgId) this.offersMsgId.set(chatId, newMsgId);
        } else {
          // No images: edit the list message in place
          const newMsgId = await this.editOrSend(chatId, messageId, detail.text, detail.buttons);
          if (newMsgId) this.offersMsgId.set(chatId, newMsgId);
        }

        // Send documents after the detail text
        for (const doc of detail.documentFileIds) {
          await this.telegramService.sendDocument(
            chatId,
            doc.fileId,
            doc.fileName,
          );
        }
        return;
      }

      // offers:b:{travelRequestId} → back to list (EDIT detail msg, fallback NEW)
      if (data.startsWith('offers:b:')) {
        const travelRequestId = data.replace('offers:b:', '');

        this.logger.log(
          `[offers-view] action=back_to_list, chatId=${chatId}, userId=${userId}, requestId=${travelRequestId}`,
        );

        const result = await this.offerViewer.getOfferList(
          travelRequestId,
          userId,
        );

        if (!result.buttons) {
          await this.telegramService.sendMessage(chatId, result.text);
          return;
        }

        const newMsgId = await this.editOrSend(chatId, messageId, result.text, result.buttons);
        if (newMsgId) this.offersMsgId.set(chatId, newMsgId);
        return;
      }
    } catch (error) {
      this.logger.error(
        `[offers-view] action=error, chatId=${chatId}, userId=${userId}, data=${data}, error=${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.telegramService
        .sendMessage(chatId, 'Something went wrong. Please try again.')
        .catch(() => {});
    }
  }

  // ---------------------------------------------------------------------------
  // Proxy chat handlers
  // ---------------------------------------------------------------------------

  private async handleChatCallback(ctx: BotContext): Promise<void> {
    const chatId = ctx.callbackQuery?.message?.chat.id;
    const data = ctx.callbackQuery?.data;
    if (!chatId || !data) return;

    await ctx.answerCallbackQuery().catch(() => {});

    this.logger.log(`[chat-callback] chatId=${chatId}, data=${data}`);

    try {
      // chat:reply:{proxyChatId} → agent enters reply mode with sticky session
      if (data.startsWith('chat:reply:')) {
        const proxyChatId = data.replace('chat:reply:', '');
        if (!ctx.dbUser) return;

        const result = await this.proxyChatSession.startAgencyReply(
          chatId,
          proxyChatId,
          ctx.dbUser.telegramId,
        );

        if (result.proxyChatId) {
          const session = this.proxyChatSession.getSession(chatId);
          if (session) {
            await this.enterChatSession(chatId, session);
          }
        } else {
          await this.telegramService.sendMessage(chatId, result.text);
        }
        return;
      }

      // chat:close:{proxyChatId} → close the chat
      if (data.startsWith('chat:close:')) {
        const proxyChatId = data.replace('chat:close:', '');
        const session = this.proxyChatSession.getSession(chatId);
        if (session) {
          await this.exitChatSession(chatId, session, 'user');
        }
        await this.proxyChatSession.closeChat(chatId, proxyChatId);
        return;
      }

      // chat:mgr:{proxyChatId} → traveler enters manager chat with sticky session
      if (data.startsWith('chat:mgr:')) {
        const proxyChatId = data.replace('chat:mgr:', '');
        if (!ctx.dbUser) return;

        const result = await this.proxyChatSession.startTravelerManagerChat(
          chatId,
          proxyChatId,
          ctx.dbUser.id,
        );

        if (result.proxyChatId) {
          const session = this.proxyChatSession.getSession(chatId);
          if (session) {
            await this.enterChatSession(chatId, session);
          }
        } else {
          await this.telegramService.sendMessage(chatId, result.text);
        }
        return;
      }

      // chat:back:{offerId} → exit chat mode, show offer detail
      if (data.startsWith('chat:back:')) {
        const offerId = data.replace('chat:back:', '');
        const session = this.proxyChatSession.getSession(chatId);
        if (session) {
          await this.exitChatSession(chatId, session, 'user');
        } else {
          this.proxyChatSession.exitSession(chatId);
        }

        if (!ctx.dbUser) return;
        const result = await this.offerViewer.getOfferDetail(
          offerId,
          ctx.dbUser.id,
        );

        if (result.buttons) {
          await this.telegramService.sendRfqToAgency(
            chatId,
            result.text,
            result.buttons,
          );
        } else {
          await this.telegramService.sendMessage(chatId, result.text);
        }
        return;
      }
    } catch (error) {
      this.logger.error(
        `[chat-callback] Error chatId=${chatId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.telegramService
        .sendMessage(chatId, 'Something went wrong. Please try again.')
        .catch(() => {});
    }
  }

  private async handleManagerCallback(ctx: BotContext): Promise<void> {
    const chatId = ctx.callbackQuery?.message?.chat.id;
    const data = ctx.callbackQuery?.data;
    if (!chatId || !data) return;

    await ctx.answerCallbackQuery().catch(() => {});

    if (!ctx.dbUser) return;

    this.logger.log(`[manager-callback] chatId=${chatId}, data=${data}`);

    try {
      // mgr:claim:{travelRequestId} → manager claims the booking
      if (data.startsWith('mgr:claim:')) {
        const travelRequestId = data.replace('mgr:claim:', '');

        if (
          ctx.dbUser.role !== UserRole.MANAGER &&
          ctx.dbUser.role !== UserRole.ADMIN
        ) {
          await this.telegramService.sendMessage(
            chatId,
            'Only managers and admins can claim bookings.',
          );
          return;
        }

        const result = await this.managerTakeover.claimChat(
          travelRequestId,
          ctx.dbUser.id,
          ctx.dbUser.telegramId,
        );

        await this.telegramService.sendMessage(chatId, result.text);

        // Send notifications (traveler + agency agents)
        for (const notif of result.notifications) {
          if (notif.buttons && notif.buttons.length > 0) {
            await this.telegramService
              .sendRfqToAgency(notif.chatId, notif.text, notif.buttons)
              .catch((err) => {
                this.logger.error(
                  `[manager-takeover] Failed to notify ${notif.chatId}: ${err}`,
                );
              });
          } else {
            await this.telegramService
              .sendMessage(notif.chatId, notif.text)
              .catch((err) => {
                this.logger.error(
                  `[manager-takeover] Failed to notify ${notif.chatId}: ${err}`,
                );
              });
          }
        }
        return;
      }
    } catch (error) {
      this.logger.error(
        `[manager-callback] Error chatId=${chatId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.telegramService
        .sendMessage(chatId, 'Something went wrong. Please try again.')
        .catch(() => {});
    }
  }

  private async handleProxyChatMessage(
    chatId: number,
    content: string,
    contentType: MessageContentType,
    telegramFileId?: string,
  ): Promise<void> {
    this.proxyChatSession.touchSession(chatId);

    try {
      const result = await this.proxyChatSession.handleMessage(
        chatId,
        content,
        contentType,
        telegramFileId,
      );

      // If message was blocked (permissions or contact leak), warn the sender
      if (result.blocked) {
        await this.telegramService
          .sendMessage(chatId, result.warningMessage ?? 'Message blocked.')
          .catch(() => {});
        return;
      }

      const session = this.proxyChatSession.getSession(chatId);

      for (const target of result.targets) {
        if (target.contentType === MessageContentType.PHOTO && target.telegramFileId) {
          await this.telegramService.sendMediaGroup(
            target.chatId,
            [target.telegramFileId],
          ).catch((err) => {
            this.logger.error(
              `[proxy-chat] Failed to forward photo to ${target.chatId}: ${err}`,
            );
          });
          // Also send the text label
          const replyButton = session
            ? [{ label: '\u21a9 Reply', callbackData: `chat:reply:${session.proxyChatId}` }]
            : [];
          await this.telegramService.sendRfqToAgency(
            target.chatId,
            target.text,
            replyButton,
          ).catch(() => {});
        } else if (target.contentType === MessageContentType.DOCUMENT && target.telegramFileId) {
          await this.telegramService.sendDocument(
            target.chatId,
            target.telegramFileId,
          ).catch((err) => {
            this.logger.error(
              `[proxy-chat] Failed to forward document to ${target.chatId}: ${err}`,
            );
          });
          const replyButton = session
            ? [{ label: '\u21a9 Reply', callbackData: `chat:reply:${session.proxyChatId}` }]
            : [];
          await this.telegramService.sendRfqToAgency(
            target.chatId,
            target.text,
            replyButton,
          ).catch(() => {});
        } else {
          // Text message — include Reply button for counterpart
          const replyButton = session
            ? [{ label: '\u21a9 Reply', callbackData: `chat:reply:${session.proxyChatId}` }]
            : [];
          await this.telegramService.sendRfqToAgency(
            target.chatId,
            target.text,
            replyButton,
          ).catch((err) => {
            this.logger.error(
              `[proxy-chat] Failed to forward text to ${target.chatId}: ${err}`,
            );
          });
        }
      }
    } catch (error) {
      this.logger.error(
        `[proxy-chat] Error forwarding from chatId=${chatId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.telegramService
        .sendMessage(chatId, 'Failed to send message. Please try again.')
        .catch(() => {});
    }
  }

  /**
   * Tries to edit the message at messageId. If edit fails, sends a new message.
   * Returns the message ID of the rendered message (for tracking).
   */
  private async editOrSend(
    chatId: number,
    messageId: number | undefined,
    text: string,
    buttons: { label: string; callbackData: string }[],
  ): Promise<number | undefined> {
    if (messageId) {
      try {
        await this.telegramService.editMessageText(
          chatId,
          messageId,
          text,
          buttons,
        );
        return messageId;
      } catch {
        // Edit failed (message too old, deleted, or not editable) — fall through to send
        this.logger.debug(
          `[offers-view] edit failed for chatId=${chatId} msgId=${messageId}, sending new message`,
        );
      }
    }

    // Fallback: send new message
    return this.telegramService.sendRfqToAgency(chatId, text, buttons);
  }

  // ---------------------------------------------------------------------------
  // Agency onboarding handlers
  // ---------------------------------------------------------------------------

  private async handleAgencyCommand(ctx: BotContext): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId || !ctx.dbUser) return;

    const telegramId = ctx.dbUser.telegramId;
    this.logger.log(`[/agency] telegramId=${telegramId}, chatId=${chatId}`);

    try {
      // Show dashboard for existing agency agents (OWNER or MANAGER)
      const dashboard = await this.agencyMgmt.buildDashboard(telegramId);
      if (dashboard) {
        await this.sendWizardResponse(chatId, dashboard);
        return;
      }

      // Fall through to application wizard for non-agents
      const result = await this.agencyApp.startOrResume(chatId, ctx.dbUser.id);
      await this.sendWizardResponse(chatId, result);
    } catch (error) {
      this.logger.error(
        `[/agency] Error for telegramId=${telegramId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.telegramService
        .sendMessage(chatId, 'Something went wrong. Please try again.')
        .catch(() => {});
    }
  }

  private async handleSetAgencyChatCommand(ctx: BotContext): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId || !ctx.dbUser) return;

    const telegramId = ctx.dbUser.telegramId;
    this.logger.log(
      `[/set_agency_chat] telegramId=${telegramId}, chatId=${chatId}`,
    );

    try {
      const result = await this.agencyMgmt.setAgencyChat(
        telegramId,
        chatId,
        ctx.chat?.title,
      );
      await this.telegramService.sendMessage(chatId, result.text);
    } catch (error) {
      this.logger.error(
        `[/set_agency_chat] Error: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.telegramService
        .sendMessage(chatId, 'Something went wrong. Please try again.')
        .catch(() => {});
    }
  }

  private async handleAddManagerCommand(ctx: BotContext): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId || !ctx.dbUser) return;

    const telegramId = ctx.dbUser.telegramId;
    this.logger.log(
      `[/add_manager] telegramId=${telegramId}, chatId=${chatId}`,
    );

    try {
      const result = await this.agencyMgmt.startAddManager(chatId, telegramId);
      await this.sendWizardResponse(chatId, result);
    } catch (error) {
      this.logger.error(
        `[/add_manager] Error: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.telegramService
        .sendMessage(chatId, 'Something went wrong. Please try again.')
        .catch(() => {});
    }
  }

  private async handleReviewCommand(ctx: BotContext): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId || !ctx.dbUser) return;

    const telegramId = ctx.dbUser.telegramId;
    this.logger.log(
      `[/review_agencies] telegramId=${telegramId}, chatId=${chatId}`,
    );

    try {
      if (ctx.dbUser.role !== UserRole.ADMIN && ctx.dbUser.role !== UserRole.MANAGER) {
        await this.telegramService.sendMessage(
          chatId,
          'This command is restricted to managers and admins.',
        );
        return;
      }

      const apps = await this.agencyApp.findPendingApplications();

      if (apps.length === 0) {
        await this.telegramService.sendMessage(
          chatId,
          'No pending agency applications.',
        );
        return;
      }

      const lines = ['*Pending Agency Applications*', ''];
      const buttons: { label: string; callbackData: string }[] = [];

      for (const app of apps) {
        const data = app.draftData as { name: string };
        lines.push(
          `- ${data.name} (${app.createdAt.toISOString().split('T')[0]})`,
        );
        buttons.push({
          label: `Review: ${data.name}`,
          callbackData: `review:view:${app.id}`,
        });
      }

      await this.sendWizardResponse(chatId, {
        text: lines.join('\n'),
        buttons,
      });
    } catch (error) {
      this.logger.error(
        `[/review_agencies] Error: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.telegramService
        .sendMessage(chatId, 'Something went wrong. Please try again.')
        .catch(() => {});
    }
  }

  private async handleAgencyCallback(ctx: BotContext): Promise<void> {
    const chatId = ctx.callbackQuery?.message?.chat.id;
    const data = ctx.callbackQuery?.data;
    if (!chatId || !data) return;

    await ctx.answerCallbackQuery().catch(() => {});

    this.logger.log(`[agency-callback] chatId=${chatId}, data=${data}`);

    try {
      // agency:* → delegate to wizard
      if (data.startsWith('agency:')) {
        const result = await this.agencyApp.handleCallback(chatId, data);
        await this.sendWizardResponse(chatId, result);
        return;
      }

      // review:view:<appId>
      if (data.startsWith('review:view:')) {
        const appId = data.replace('review:view:', '');
        const result = await this.agencyApp.getApplicationDetails(appId);
        await this.sendWizardResponse(chatId, result);
        return;
      }

      // review:approve:<appId>
      if (data.startsWith('review:approve:')) {
        const appId = data.replace('review:approve:', '');
        if (!ctx.dbUser) return;

        const result = await this.agencyApp.approveApplication(appId, ctx.dbUser.id);

        await this.telegramService.sendMessage(
          chatId,
          `Agency application approved. Agency ID: ${result.agencyId.slice(0, 8)}...`,
        );

        // Notify applicant
        if (result.applicantTelegramId) {
          await this.telegramService
            .sendMessage(
              Number(result.applicantTelegramId),
              'Your agency application has been *approved*! You will now receive RFQ notifications.',
            )
            .catch(() => {});
        }
        return;
      }

      // review:reject:<appId>
      if (data.startsWith('review:reject:')) {
        const appId = data.replace('review:reject:', '');
        if (!ctx.dbUser) return;

        const result = this.agencyApp.setPendingRejectReason(
          chatId,
          appId,
          ctx.dbUser.id,
        );
        await this.sendWizardResponse(chatId, result);
        return;
      }
    } catch (error) {
      this.logger.error(
        `[agency-callback] Error chatId=${chatId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.telegramService
        .sendMessage(chatId, 'Something went wrong. Please try again.')
        .catch(() => {});
    }
  }

  private async handleAgencyWizardText(
    chatId: number,
    text: string,
  ): Promise<void> {
    try {
      const result = await this.agencyApp.handleTextInput(chatId, text);
      await this.sendWizardResponse(chatId, result);

      // If rejection was completed, notify the applicant
      if (result.text.startsWith('Application rejected.')) {
        // The rejection reason flow already notified through the service;
        // no additional traveler notification needed here since it's
        // between the reviewer and the service layer.
      }
    } catch (error) {
      this.logger.error(
        `[agency-wizard-text] Error chatId=${chatId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.telegramService
        .sendMessage(chatId, 'Something went wrong. Please try again.')
        .catch(() => {});
    }
  }

  // ---------------------------------------------------------------------------
  // Agency management handlers
  // ---------------------------------------------------------------------------

  private async handleAddManagerText(
    ctx: BotContext,
    chatId: number,
  ): Promise<void> {
    try {
      let targetTelegramId: bigint | null = null;

      // Check for forwarded message
      const forwardOrigin = (ctx.message as any)?.forward_origin;
      if (forwardOrigin?.type === 'user') {
        targetTelegramId = BigInt(forwardOrigin.sender_user.id);
      } else if (forwardOrigin?.type === 'hidden_user') {
        this.agencyMgmt.cancelAddManager(chatId);
        await this.telegramService.sendMessage(
          chatId,
          'Cannot identify this user — their privacy settings hide their identity. ' +
            'Ask them to /start the bot and send you their Telegram ID.',
        );
        return;
      }

      // Fallback: parse text as numeric Telegram ID
      if (!targetTelegramId) {
        const text = ctx.message?.text?.trim();
        if (text && /^\d+$/.test(text)) {
          targetTelegramId = BigInt(text);
        }
      }

      if (!targetTelegramId) {
        await this.telegramService.sendMessage(
          chatId,
          'Could not identify the user. Please forward a message from them or enter their numeric Telegram ID.',
        );
        return;
      }

      const result = await this.agencyMgmt.handleAddManagerInput(
        chatId,
        targetTelegramId,
      );
      await this.sendWizardResponse(chatId, result);
    } catch (error) {
      this.logger.error(
        `[add-manager-text] Error chatId=${chatId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      this.agencyMgmt.cancelAddManager(chatId);
      await this.telegramService
        .sendMessage(chatId, 'Something went wrong. Please try again.')
        .catch(() => {});
    }
  }

  private async handleManagementCallback(ctx: BotContext): Promise<void> {
    const chatId = ctx.callbackQuery?.message?.chat.id;
    const data = ctx.callbackQuery?.data;
    if (!chatId || !data || !ctx.dbUser) return;

    await ctx.answerCallbackQuery().catch(() => {});

    const telegramId = ctx.dbUser.telegramId;
    this.logger.log(`[mgmt-callback] chatId=${chatId}, data=${data}`);

    try {
      if (data === 'mgmt:cancel_add') {
        this.agencyMgmt.cancelAddManager(chatId);
        await this.telegramService.sendMessage(
          chatId,
          'Add manager cancelled.',
        );
        return;
      }

      if (data === 'mgmt:set_chat_info') {
        await this.telegramService.sendMessage(
          chatId,
          'To set the agency group chat, add the bot to your group and run /set\\_agency\\_chat there.',
        );
        return;
      }

      if (data === 'mgmt:add_manager') {
        const result = await this.agencyMgmt.startAddManager(
          chatId,
          telegramId,
        );
        await this.sendWizardResponse(chatId, result);
        return;
      }
    } catch (error) {
      this.logger.error(
        `[mgmt-callback] Error chatId=${chatId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.telegramService
        .sendMessage(chatId, 'Something went wrong. Please try again.')
        .catch(() => {});
    }
  }

  // ---------------------------------------------------------------------------
  // Sticky chat session helpers
  // ---------------------------------------------------------------------------

  /**
   * Enters sticky chat mode: sends pinned header + shows persistent reply keyboard.
   */
  private async enterChatSession(
    chatId: number,
    session: ProxyChatSession,
    language: SupportedLanguage = 'EN',
  ): Promise<void> {
    let keyboard: Keyboard;
    let headerKey: ChatHeaderKey;

    if (session.isManager) {
      keyboard = buildManagerKeyboard();
      headerKey = 'chat_header_manager';
    } else if (session.senderType === MessageSenderType.AGENCY) {
      keyboard = buildAgencyKeyboard();
      headerKey = 'chat_header_agency';
    } else {
      keyboard = buildTravelerKeyboard();
      headerKey = 'chat_header_traveler';
    }

    const headerText = getChatHeaderMessage(headerKey, language, session.agencyName);
    const headerMsgId = await this.telegramService.sendReplyKeyboard(
      chatId,
      headerText,
      keyboard,
    );

    // Pin the header (best-effort — may fail in private chats)
    if (headerMsgId) {
      const pinned = await this.telegramService.pinMessage(chatId, headerMsgId);
      if (pinned) {
        this.proxyChatSession.setPinnedMessageId(chatId, headerMsgId);
      }
    }
  }

  /**
   * Exits sticky chat mode: unpins header, removes reply keyboard, clears session.
   */
  private async exitChatSession(
    chatId: number,
    session: ProxyChatSession,
    reason: 'user' | 'timeout' | 'start',
  ): Promise<void> {
    // Unpin header if we tracked it
    if (session.pinnedMessageId) {
      await this.telegramService.unpinMessage(chatId, session.pinnedMessageId);
    }

    // Remove reply keyboard with appropriate message
    const exitText =
      reason === 'timeout'
        ? getTelegramMessage('chat_timeout', 'EN')
        : getTelegramMessage('chat_exit', 'EN');

    await this.telegramService
      .removeReplyKeyboard(chatId, exitText)
      .catch(() => {});

    // Clear in-memory session
    this.proxyChatSession.exitSession(chatId);
  }

  /**
   * Handles reply-keyboard button presses during an active chat session.
   */
  private async handleChatKeyboardPress(
    chatId: number,
    buttonText: string,
  ): Promise<void> {
    const session = this.proxyChatSession.getSession(chatId);
    if (!session) return;

    this.logger.log(
      `[proxy-chat] action=keyboard_press, chatId=${chatId}, button="${buttonText}"`,
    );

    switch (buttonText) {
      case KB_EXIT_CHAT:
        await this.exitChatSession(chatId, session, 'user');
        break;

      case KB_BOOKING_DETAILS:
      case KB_CHAT_DETAILS:
        if (session.offerId) {
          try {
            const result = await this.offerViewer.getOfferDetail(
              session.offerId,
              session.senderId,
            );
            // Send as plain text — stay in chat mode
            await this.telegramService.sendMessage(chatId, result.text);
          } catch (error) {
            this.logger.error(
              `[proxy-chat] Failed to fetch booking details: ${error}`,
            );
            await this.telegramService
              .sendMessage(chatId, 'Could not load details. Please try again.')
              .catch(() => {});
          }
        } else {
          await this.telegramService
            .sendMessage(chatId, 'No offer associated with this chat.')
            .catch(() => {});
        }
        break;

      case KB_CONTACT_MANAGER:
        await this.handleContactManagerRequest(chatId, session);
        break;
    }
  }

  /**
   * Sends a manager-escalation notification to the manager channel.
   */
  private async handleContactManagerRequest(
    chatId: number,
    session: ProxyChatSession,
  ): Promise<void> {
    try {
      const managerChannelChatId =
        this.bookingAcceptance.getManagerChannelChatId();
      if (managerChannelChatId) {
        const notifText =
          `\ud83c\udd98 *Manager Assistance Requested*\n\n` +
          `A traveler is requesting manager help.\n` +
          `Chat ID: \`${session.proxyChatId}\``;

        await this.telegramService
          .sendMessage(managerChannelChatId, notifText)
          .catch((err) => {
            this.logger.error(
              `[proxy-chat] Failed to notify manager channel: ${err}`,
            );
          });
      }

      await this.telegramService.sendMessage(
        chatId,
        getTelegramMessage('chat_manager_requested', 'EN'),
      );
    } catch (error) {
      this.logger.error(
        `[proxy-chat] Failed to handle contact manager request: ${error}`,
      );
      await this.telegramService
        .sendMessage(chatId, 'Something went wrong. Please try again.')
        .catch(() => {});
    }
  }

  /**
   * Periodic sweep: closes sessions that have been inactive for > SESSION_TIMEOUT_MS.
   */
  private async cleanupExpiredSessions(): Promise<void> {
    const expired = this.proxyChatSession.getExpiredSessions(SESSION_TIMEOUT_MS);
    for (const { chatId, session } of expired) {
      this.logger.log(
        `[proxy-chat] action=session_timeout, chatId=${chatId}, proxyChatId=${session.proxyChatId}`,
      );
      await this.exitChatSession(chatId, session, 'timeout');
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  private mapCallbackToMessage(callbackData: string): string {
    if (callbackData === 'action:confirm') return '__CONFIRM__';
    if (callbackData === 'action:cancel') return '__CANCEL__';
    if (callbackData.startsWith('action:edit:')) {
      return `__EDIT__${callbackData.substring('action:edit:'.length)}`;
    }
    return callbackData;
  }

  private async safeReply(
    chatId: number,
    language: SupportedLanguage,
    errorType: 'generic' | 'infrastructure' = 'generic',
  ): Promise<void> {
    try {
      const msgKey = errorType === 'infrastructure' ? 'error_infrastructure' : 'error_generic';
      await this.telegramService.sendMessage(
        chatId,
        getTelegramMessage(msgKey, language),
      );
    } catch {
      this.logger.error(`Failed to send error message to chat ${chatId}`);
    }
  }

  /**
   * Runtime guard against stale dist/ builds.
   * Asserts that injected services expose the methods TelegramUpdate relies on.
   * If a method was renamed in source but dist/ still has the old compiled JS,
   * this will catch the mismatch at startup instead of at first user request.
   */
  private assertServiceContracts(): void {
    const checks: [string, unknown][] = [
      ['agenciesService.isActiveMember', this.agenciesService?.isActiveMember],
      ['aiEngine.processMessage', this.aiEngine?.processMessage],
      ['offerWizard.hasActiveWizard', this.offerWizard?.hasActiveWizard],
      ['offerViewer.getOfferList', this.offerViewer?.getOfferList],
      ['agencyMgmt.buildDashboard', this.agencyMgmt?.buildDashboard],
      ['proxyChatSession.hasActiveSession', this.proxyChatSession?.hasActiveSession],
      ['proxyChatSession.getExpiredSessions', this.proxyChatSession?.getExpiredSessions],
      ['proxyChatSession.touchSession', this.proxyChatSession?.touchSession],
      ['proxyChatSession.setPinnedMessageId', this.proxyChatSession?.setPinnedMessageId],
      ['bookingAcceptance.showConfirmation', this.bookingAcceptance?.showConfirmation],
      ['managerTakeover.onBookingCreated', this.managerTakeover?.onBookingCreated],
    ];

    for (const [name, method] of checks) {
      if (typeof method !== 'function') {
        const msg = `[FATAL] Service contract broken: ${name} is not a function. Likely stale dist/ — run "npm run clean && npm run build"`;
        this.logger.error(msg);
        throw new Error(msg);
      }
    }

    this.logger.log('Service contract checks passed');
  }
}

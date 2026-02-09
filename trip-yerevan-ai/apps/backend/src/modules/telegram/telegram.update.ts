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
import { AgencyApplicationService } from '../agencies/agency-application.service';
import { AgenciesService } from '../agencies/agencies.service';
import { AgencyManagementService } from '../agencies/agency-management.service';
import {
  getTelegramMessage,
  prismaLanguageToSupported,
} from './telegram-messages';
import { SupportedLanguage } from '../ai/types';
import { UserRole } from '@prisma/client';
import { BotContext } from './telegram-context';

@Injectable()
export class TelegramUpdate implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramUpdate.name);
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private stopping = false;

  constructor(
    @Inject(TELEGRAM_BOT) private readonly bot: TelegramBot,
    private readonly aiEngine: AiEngineService,
    private readonly telegramService: TelegramService,
    private readonly rateLimiter: TelegramRateLimiter,
    private readonly userMiddleware: TelegramUserMiddleware,
    private readonly offerWizard: OfferWizardService,
    private readonly agencyApp: AgencyApplicationService,
    private readonly agenciesService: AgenciesService,
    private readonly agencyMgmt: AgencyManagementService,
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
    this.bot.callbackQuery(/^action:/, (ctx) =>
      this.handleCallbackQuery(ctx),
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

    this.bot.catch((err) => {
      this.logger.error(`Bot error: ${err.message}`, err.stack);
    });

    this.startPolling();

    this.cleanupInterval = setInterval(() => {
      this.rateLimiter.cleanup();
    }, 60_000);
  }

  async onModuleDestroy(): Promise<void> {
    this.stopping = true;
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
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
      await this.safeReply(chatId, 'RU');
    }
  }

  // ---------------------------------------------------------------------------
  // Text message
  // ---------------------------------------------------------------------------
  private async handleTextMessage(ctx: BotContext): Promise<void> {
    const chatId = ctx.chat?.id;
    const text = ctx.message?.text;
    if (!chatId || !text) return;

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
      this.logger.error(
        `[message] EXCEPTION for telegramId=${telegramId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      const lang = prismaLanguageToSupported(ctx.dbUser.preferredLanguage);
      await this.safeReply(chatId, lang);
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
      this.logger.error(
        `[callback] Error for telegramId=${ctx.dbUser.telegramId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      const lang = prismaLanguageToSupported(ctx.dbUser.preferredLanguage);
      await this.safeReply(chatId, lang);
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
  ): Promise<void> {
    try {
      await this.telegramService.sendErrorMessage(chatId, language);
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
      ['agencyMgmt.buildDashboard', this.agencyMgmt?.buildDashboard],
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

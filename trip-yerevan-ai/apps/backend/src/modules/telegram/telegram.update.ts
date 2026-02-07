import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { TELEGRAM_BOT, TelegramBot } from './telegram-bot.provider';
import { UsersService, TelegramUserData } from '../users/users.service';
import { AiEngineService } from '../ai/services/ai-engine.service';
import { TelegramService } from './telegram.service';
import { TelegramRateLimiter } from './telegram-rate-limiter';
import { OfferWizardService } from '../offers/offer-wizard.service';
import { isOfferSubmitResult } from '../offers/offer-wizard.types';
import { AgencyApplicationService } from '../agencies/agency-application.service';
import {
  getTelegramMessage,
  prismaLanguageToSupported,
} from './telegram-messages';
import { SupportedLanguage } from '../ai/types';
import { UserRole } from '@prisma/client';
import type { Context } from 'grammy';

@Injectable()
export class TelegramUpdate implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramUpdate.name);
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    @Inject(TELEGRAM_BOT) private readonly bot: TelegramBot,
    private readonly usersService: UsersService,
    private readonly aiEngine: AiEngineService,
    private readonly telegramService: TelegramService,
    private readonly rateLimiter: TelegramRateLimiter,
    private readonly offerWizard: OfferWizardService,
    private readonly agencyApp: AgencyApplicationService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.bot) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not set, bot will not start');
      return;
    }

    this.logger.log('Registering Telegram bot handlers');

    this.bot.command('start', (ctx) => this.handleStart(ctx));
    this.bot.command('agency', (ctx) => this.handleAgencyCommand(ctx));
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
    this.bot.callbackQuery(/^(agency:|review:)/, (ctx) =>
      this.handleAgencyCallback(ctx),
    );

    this.bot.catch((err) => {
      this.logger.error(`Bot error: ${err.message}`, err.stack);
    });

    this.logger.log('Starting Telegram bot polling');

    this.bot.start({
      onStart: () => {
        this.logger.log('Telegram bot is now receiving updates');
      },
    });

    this.cleanupInterval = setInterval(() => {
      this.rateLimiter.cleanup();
    }, 60_000);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.bot) {
      this.bot.stop();
      this.logger.log('Telegram bot stopped');
    }
  }

  // ---------------------------------------------------------------------------
  // /start
  // ---------------------------------------------------------------------------
  private async handleStart(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const from = ctx.from;
    if (!chatId || !from) return;

    const telegramId = BigInt(from.id);
    this.logger.log(`[/start] telegramId=${telegramId}, chatId=${chatId}`);

    try {
      const userData: TelegramUserData = {
        telegramId,
        firstName: from.first_name,
        lastName: from.last_name,
        languageCode: from.language_code,
      };

      const user = await this.usersService.findOrCreateByTelegram(userData);
      const language = prismaLanguageToSupported(user.preferredLanguage);

      const isNew = user.createdAt.getTime() > Date.now() - 5000;
      const messageKey = isNew ? 'welcome' : 'welcome_returning';

      await this.telegramService.sendMessage(
        chatId,
        getTelegramMessage(messageKey, language),
      );
    } catch (error) {
      this.logger.error(
        `[/start] Error for telegramId=${telegramId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.safeReply(chatId, 'RU');
    }
  }

  // ---------------------------------------------------------------------------
  // Text message
  // ---------------------------------------------------------------------------
  private async handleTextMessage(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const from = ctx.from;
    const text = ctx.message?.text;
    if (!chatId || !from || !text) return;

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

    const telegramId = BigInt(from.id);

    if (this.rateLimiter.isRateLimited(telegramId)) {
      this.logger.debug(`[rate-limited] telegramId=${telegramId}`);
      const user = await this.usersService
        .findByTelegramId(telegramId)
        .catch(() => null);
      const lang = user
        ? prismaLanguageToSupported(user.preferredLanguage)
        : 'RU';
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
      const user = await this.usersService.findByTelegramId(telegramId);
      if (!user) {
        await this.telegramService.sendMessage(
          chatId,
          getTelegramMessage('error_not_registered', 'RU'),
        );
        return;
      }

      const language = prismaLanguageToSupported(user.preferredLanguage);
      const response = await this.aiEngine.processMessage(user.id, text);

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
        `[message] Error for telegramId=${telegramId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      const user = await this.usersService
        .findByTelegramId(telegramId)
        .catch(() => null);
      const lang = user
        ? prismaLanguageToSupported(user.preferredLanguage)
        : 'RU';
      await this.safeReply(chatId, lang);
    }
  }

  // ---------------------------------------------------------------------------
  // Callback query (inline keyboard buttons)
  // ---------------------------------------------------------------------------
  private async handleCallbackQuery(ctx: Context): Promise<void> {
    const chatId = ctx.callbackQuery?.message?.chat.id;
    const from = ctx.from;
    const data = ctx.callbackQuery?.data;
    if (!chatId || !from || !data) return;

    const telegramId = BigInt(from.id);

    await ctx.answerCallbackQuery().catch(() => {});

    this.logger.log(`[callback] telegramId=${telegramId}, data=${data}`);

    try {
      const user = await this.usersService.findByTelegramId(telegramId);
      if (!user) {
        await this.telegramService.sendMessage(
          chatId,
          getTelegramMessage('error_not_registered', 'RU'),
        );
        return;
      }

      const syntheticMessage = this.mapCallbackToMessage(data);
      const response = await this.aiEngine.processMessage(
        user.id,
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
        `[callback] Error for telegramId=${telegramId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      const user = await this.usersService
        .findByTelegramId(telegramId)
        .catch(() => null);
      const lang = user
        ? prismaLanguageToSupported(user.preferredLanguage)
        : 'RU';
      await this.safeReply(chatId, lang);
    }
  }

  // ---------------------------------------------------------------------------
  // Offer wizard handlers
  // ---------------------------------------------------------------------------

  private async handleOfferCallback(ctx: Context): Promise<void> {
    const chatId = ctx.callbackQuery?.message?.chat.id;
    const from = ctx.from;
    const data = ctx.callbackQuery?.data;
    if (!chatId || !from || !data) return;

    await ctx.answerCallbackQuery().catch(() => {});

    this.logger.log(`[offer-callback] chatId=${chatId}, data=${data}`);

    try {
      // rfq:offer:<travelRequestId> → start wizard
      if (data.startsWith('rfq:offer:')) {
        const travelRequestId = data.replace('rfq:offer:', '');
        const telegramId = BigInt(from.id);
        const result = await this.offerWizard.startWizard(
          chatId,
          travelRequestId,
          telegramId,
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
    ctx: Context,
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

  private async handleAgencyCommand(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const from = ctx.from;
    if (!chatId || !from) return;

    const telegramId = BigInt(from.id);
    this.logger.log(`[/agency] telegramId=${telegramId}, chatId=${chatId}`);

    try {
      const result = await this.agencyApp.startOrResume(chatId, telegramId);
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

  private async handleReviewCommand(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const from = ctx.from;
    if (!chatId || !from) return;

    const telegramId = BigInt(from.id);
    this.logger.log(
      `[/review_agencies] telegramId=${telegramId}, chatId=${chatId}`,
    );

    try {
      // Check user role
      const user = await this.usersService.findByTelegramId(telegramId);
      if (!user) {
        await this.telegramService.sendMessage(
          chatId,
          'You are not registered.',
        );
        return;
      }

      if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
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

  private async handleAgencyCallback(ctx: Context): Promise<void> {
    const chatId = ctx.callbackQuery?.message?.chat.id;
    const from = ctx.from;
    const data = ctx.callbackQuery?.data;
    if (!chatId || !from || !data) return;

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
        const telegramId = BigInt(from.id);
        const user = await this.usersService.findByTelegramId(telegramId);
        if (!user) return;

        const result = await this.agencyApp.approveApplication(appId, user.id);

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
        const telegramId = BigInt(from.id);
        const user = await this.usersService.findByTelegramId(telegramId);
        if (!user) return;

        const result = this.agencyApp.setPendingRejectReason(
          chatId,
          appId,
          user.id,
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
}

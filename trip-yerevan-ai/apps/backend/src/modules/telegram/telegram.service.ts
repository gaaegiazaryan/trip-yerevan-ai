import { Inject, Injectable, Logger } from '@nestjs/common';
import { InlineKeyboard } from 'grammy';
import { TELEGRAM_BOT, TelegramBot } from './telegram-bot.provider';
import { SuggestedAction, SupportedLanguage } from '../ai/types';
import { getTelegramMessage } from './telegram-messages';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    @Inject(TELEGRAM_BOT) private readonly bot: TelegramBot,
  ) {}

  async sendMessage(chatId: number, text: string): Promise<void> {
    if (!this.bot) {
      this.logger.warn('Bot not initialized, cannot send message');
      return;
    }

    try {
      await this.bot.api.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      // Markdown parse failure — retry without formatting
      this.logger.warn(
        `Markdown send failed for chat ${chatId}, retrying as plain text`,
      );
      try {
        await this.bot.api.sendMessage(chatId, text);
      } catch (retryError) {
        this.logger.error(
          `Failed to send message to chat ${chatId}: ${retryError}`,
        );
        throw retryError;
      }
    }
  }

  async sendInlineKeyboard(
    chatId: number,
    text: string,
    actions: SuggestedAction[],
  ): Promise<void> {
    if (!this.bot) {
      this.logger.warn('Bot not initialized, cannot send keyboard');
      return;
    }

    const keyboard = new InlineKeyboard();

    for (const action of actions) {
      keyboard.text(action.label, this.buildCallbackData(action)).row();
    }

    try {
      await this.bot.api.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } catch (error) {
      // Markdown parse failure — retry without formatting
      this.logger.warn(
        `Markdown keyboard send failed for chat ${chatId}, retrying as plain text`,
      );
      try {
        await this.bot.api.sendMessage(chatId, text, {
          reply_markup: keyboard,
        });
      } catch (retryError) {
        this.logger.error(
          `Failed to send inline keyboard to chat ${chatId}: ${retryError}`,
        );
        throw retryError;
      }
    }
  }

  async sendErrorMessage(
    chatId: number,
    language: SupportedLanguage = 'RU',
  ): Promise<void> {
    const text = getTelegramMessage('error_generic', language);
    await this.sendMessage(chatId, text);
  }

  async sendOfferNotification(
    chatId: number,
    travelRequestId: string,
  ): Promise<void> {
    if (!this.bot) {
      this.logger.warn('Bot not initialized, cannot send offer notification');
      return;
    }

    const text = '\ud83d\udce8 *New offer received* for your travel request\\!';

    const keyboard = new InlineKeyboard();
    keyboard
      .text('\ud83d\udccb View offers', `offers:view:${travelRequestId}`)
      .row();

    try {
      await this.bot.api.sendMessage(chatId, text, {
        parse_mode: 'MarkdownV2',
        reply_markup: keyboard,
      });
    } catch {
      // Fallback without formatting
      try {
        await this.bot.api.sendMessage(
          chatId,
          'New offer received for your travel request!',
          { reply_markup: keyboard },
        );
      } catch (retryError) {
        this.logger.error(
          `Failed to send offer notification to chat ${chatId}: ${retryError}`,
        );
      }
    }
  }

  /**
   * Sends an RFQ notification to an agency Telegram chat with inline action buttons.
   * This is a pure I/O adapter method — message formatting is handled by the caller.
   */
  async sendRfqToAgency(
    chatId: number,
    text: string,
    actions: { label: string; callbackData: string }[],
  ): Promise<void> {
    if (!this.bot) {
      this.logger.warn('Bot not initialized, cannot send RFQ to agency');
      throw new Error('Telegram bot is not initialized');
    }

    const keyboard = new InlineKeyboard();
    for (const action of actions) {
      keyboard.text(action.label, action.callbackData).row();
    }

    try {
      await this.bot.api.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } catch (error) {
      // Markdown parse failure — retry without formatting
      this.logger.warn(
        `Markdown RFQ send failed for chat ${chatId}, retrying as plain text`,
      );
      try {
        await this.bot.api.sendMessage(chatId, text, {
          reply_markup: keyboard,
        });
      } catch (retryError) {
        this.logger.error(
          `Failed to send RFQ to agency chat ${chatId}: ${retryError}`,
        );
        throw retryError;
      }
    }
  }

  private buildCallbackData(action: SuggestedAction): string {
    switch (action.type) {
      case 'confirm':
        return 'action:confirm';
      case 'cancel':
        return 'action:cancel';
      case 'edit_field':
        return `action:edit:${action.payload}`;
    }
  }
}

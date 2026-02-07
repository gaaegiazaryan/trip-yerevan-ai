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
    offerCount: number,
  ): Promise<void> {
    // TODO: implement when distribution-to-Telegram notification is wired
    this.logger.log(
      `Notifying ${chatId} about ${offerCount} offers for request ${travelRequestId}`,
    );
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

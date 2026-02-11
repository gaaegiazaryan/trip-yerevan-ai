import { Inject, Injectable, Logger } from '@nestjs/common';
import { InlineKeyboard, Keyboard } from 'grammy';
import { TELEGRAM_BOT, TelegramBot } from './telegram-bot.provider';
import { SuggestedAction, SupportedLanguage } from '../ai/types';
import { getTelegramMessage } from './telegram-messages';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    @Inject(TELEGRAM_BOT) private readonly bot: TelegramBot,
  ) {}

  async sendMessage(chatId: number, text: string): Promise<number | undefined> {
    if (!this.bot) {
      this.logger.warn('Bot not initialized, cannot send message');
      return undefined;
    }

    try {
      const msg = await this.bot.api.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
      });
      return msg.message_id;
    } catch (error) {
      // Markdown parse failure — retry without formatting
      this.logger.warn(
        `Markdown send failed for chat ${chatId}, retrying as plain text`,
      );
      try {
        const msg = await this.bot.api.sendMessage(chatId, text);
        return msg.message_id;
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
  ): Promise<number | undefined> {
    if (!this.bot) {
      this.logger.warn('Bot not initialized, cannot send RFQ to agency');
      throw new Error('Telegram bot is not initialized');
    }

    const keyboard = new InlineKeyboard();
    for (const action of actions) {
      keyboard.text(action.label, action.callbackData).row();
    }

    try {
      const msg = await this.bot.api.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
      return msg.message_id;
    } catch (error) {
      // Markdown parse failure — retry without formatting
      this.logger.warn(
        `Markdown RFQ send failed for chat ${chatId}, retrying as plain text`,
      );
      try {
        const msg = await this.bot.api.sendMessage(chatId, text, {
          reply_markup: keyboard,
        });
        return msg.message_id;
      } catch (retryError) {
        this.logger.error(
          `Failed to send RFQ to agency chat ${chatId}: ${retryError}`,
        );
        throw retryError;
      }
    }
  }

  /**
   * Sends a message with a single inline URL button (e.g., direct Telegram link).
   */
  async sendMessageWithUrlButton(
    chatId: number,
    text: string,
    buttonLabel: string,
    url: string,
  ): Promise<number | undefined> {
    if (!this.bot) {
      this.logger.warn('Bot not initialized, cannot send URL button');
      return undefined;
    }

    const keyboard = new InlineKeyboard().url(buttonLabel, url).row();

    try {
      const msg = await this.bot.api.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
      return msg.message_id;
    } catch (error) {
      this.logger.warn(
        `Markdown URL button send failed for chat ${chatId}, retrying as plain text`,
      );
      try {
        const msg = await this.bot.api.sendMessage(chatId, text, {
          reply_markup: keyboard,
        });
        return msg.message_id;
      } catch (retryError) {
        this.logger.error(
          `Failed to send URL button to chat ${chatId}: ${retryError}`,
        );
        throw retryError;
      }
    }
  }

  async editMessageText(
    chatId: number,
    messageId: number,
    text: string,
    buttons?: { label: string; callbackData: string }[],
  ): Promise<void> {
    if (!this.bot) {
      this.logger.warn('Bot not initialized, cannot edit message');
      return;
    }

    const keyboard = buttons ? new InlineKeyboard() : undefined;
    if (keyboard && buttons) {
      for (const action of buttons) {
        keyboard.text(action.label, action.callbackData).row();
      }
    }

    try {
      await this.bot.api.editMessageText(chatId, messageId, text, {
        parse_mode: 'Markdown',
        ...(keyboard ? { reply_markup: keyboard } : {}),
      });
    } catch (error: unknown) {
      // "message is not modified" is a no-op, not a real error
      const desc = (error as { description?: string })?.description ?? '';
      if (desc.includes('message is not modified')) return;

      this.logger.warn(
        `Markdown edit failed for chat ${chatId}, retrying as plain text`,
      );
      try {
        await this.bot.api.editMessageText(chatId, messageId, text, {
          ...(keyboard ? { reply_markup: keyboard } : {}),
        });
      } catch (retryError) {
        this.logger.error(
          `Failed to edit message in chat ${chatId}: ${retryError}`,
        );
        throw retryError;
      }
    }
  }

  async deleteMessage(chatId: number, messageId: number): Promise<void> {
    if (!this.bot) return;

    try {
      await this.bot.api.deleteMessage(chatId, messageId);
    } catch (error) {
      // Message may already be deleted or too old — not critical
      this.logger.debug(
        `Failed to delete message ${messageId} in chat ${chatId}: ${error}`,
      );
    }
  }

  async sendMediaGroup(
    chatId: number,
    fileIds: string[],
    caption?: string,
  ): Promise<void> {
    if (!this.bot || fileIds.length === 0) return;

    try {
      const media = fileIds.map((fileId, i) => ({
        type: 'photo' as const,
        media: fileId,
        ...(i === 0 && caption ? { caption } : {}),
      }));
      await this.bot.api.sendMediaGroup(chatId, media);
    } catch (error) {
      this.logger.error(
        `Failed to send media group to chat ${chatId}: ${error}`,
      );
    }
  }

  async sendDocument(
    chatId: number,
    fileId: string,
    caption?: string,
  ): Promise<void> {
    if (!this.bot) return;

    try {
      await this.bot.api.sendDocument(chatId, fileId, {
        caption,
        parse_mode: 'Markdown',
      });
    } catch (error) {
      this.logger.error(
        `Failed to send document to chat ${chatId}: ${error}`,
      );
    }
  }

  /**
   * Sends a message with a ReplyKeyboardMarkup (persistent bottom buttons).
   * Returns the message ID for potential pinning.
   */
  async sendReplyKeyboard(
    chatId: number,
    text: string,
    keyboard: Keyboard,
  ): Promise<number | undefined> {
    if (!this.bot) {
      this.logger.warn('Bot not initialized, cannot send reply keyboard');
      return undefined;
    }

    try {
      const msg = await this.bot.api.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
      return msg.message_id;
    } catch (error) {
      this.logger.warn(
        `Markdown reply keyboard send failed for chat ${chatId}, retrying as plain text`,
      );
      try {
        const msg = await this.bot.api.sendMessage(chatId, text, {
          reply_markup: keyboard,
        });
        return msg.message_id;
      } catch (retryError) {
        this.logger.error(
          `Failed to send reply keyboard to chat ${chatId}: ${retryError}`,
        );
        throw retryError;
      }
    }
  }

  /**
   * Sends a message and removes the custom reply keyboard.
   */
  async removeReplyKeyboard(
    chatId: number,
    text: string,
  ): Promise<number | undefined> {
    if (!this.bot) {
      this.logger.warn('Bot not initialized, cannot remove reply keyboard');
      return undefined;
    }

    try {
      const msg = await this.bot.api.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: { remove_keyboard: true },
      });
      return msg.message_id;
    } catch (error) {
      this.logger.warn(
        `Markdown removeKeyboard send failed for chat ${chatId}, retrying as plain text`,
      );
      try {
        const msg = await this.bot.api.sendMessage(chatId, text, {
          reply_markup: { remove_keyboard: true },
        });
        return msg.message_id;
      } catch (retryError) {
        this.logger.error(
          `Failed to remove reply keyboard in chat ${chatId}: ${retryError}`,
        );
        throw retryError;
      }
    }
  }

  /**
   * Pins a message in a chat. Returns false if pinning fails (non-critical).
   */
  async pinMessage(chatId: number, messageId: number): Promise<boolean> {
    if (!this.bot) return false;

    try {
      await this.bot.api.pinChatMessage(chatId, messageId, {
        disable_notification: true,
      });
      return true;
    } catch (error) {
      this.logger.debug(
        `Failed to pin message ${messageId} in chat ${chatId}: ${error}`,
      );
      return false;
    }
  }

  /**
   * Unpins a specific message. Returns false if unpinning fails (non-critical).
   */
  async unpinMessage(chatId: number, messageId: number): Promise<boolean> {
    if (!this.bot) return false;

    try {
      await this.bot.api.unpinChatMessage(chatId, messageId);
      return true;
    } catch (error) {
      this.logger.debug(
        `Failed to unpin message ${messageId} in chat ${chatId}: ${error}`,
      );
      return false;
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

import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { TelegramService } from '../../modules/telegram/telegram.service';
import {
  NotificationChannelProvider,
  SendResult,
} from './notification-channel.provider';

/** Telegram error codes that indicate permanent failures (no retry). */
const PERMANENT_ERROR_CODES = [
  403, // Bot blocked by user / user deactivated
  400, // Bad Request (chat not found, message too long, etc.)
];

@Injectable()
export class TelegramChannelProvider implements NotificationChannelProvider {
  private readonly logger = new Logger(TelegramChannelProvider.name);
  readonly channel = NotificationChannel.TELEGRAM;

  constructor(private readonly telegram: TelegramService) {}

  async send(
    recipientChatId: number,
    text: string,
    buttons?: { label: string; callbackData: string }[],
  ): Promise<SendResult> {
    try {
      let messageId: number | undefined;
      if (buttons && buttons.length > 0) {
        messageId = await this.telegram.sendRfqToAgency(
          recipientChatId,
          text,
          buttons,
        );
      } else {
        messageId = await this.telegram.sendMessage(recipientChatId, text);
      }
      return {
        success: true,
        providerMessageId: messageId ? String(messageId) : undefined,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const permanent = this.isPermanentError(error);

      this.logger.error(
        `[telegram-channel] Failed to send to chat ${recipientChatId}: ${errorMessage} (permanent=${permanent})`,
      );

      return { success: false, errorMessage, permanent };
    }
  }

  private isPermanentError(error: unknown): boolean {
    // grammY HttpError has error_code
    const httpCode =
      (error as any)?.error_code ??
      (error as any)?.statusCode ??
      (error as any)?.status;

    if (typeof httpCode === 'number') {
      return PERMANENT_ERROR_CODES.includes(httpCode);
    }

    // String-based detection for wrapped errors
    const msg = error instanceof Error ? error.message : String(error);
    if (
      msg.includes('bot was blocked') ||
      msg.includes('user is deactivated') ||
      msg.includes('chat not found') ||
      msg.includes('PEER_ID_INVALID')
    ) {
      return true;
    }

    return false;
  }
}

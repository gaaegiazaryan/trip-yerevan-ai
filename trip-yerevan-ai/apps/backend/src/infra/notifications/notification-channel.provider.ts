import { NotificationChannel } from '@prisma/client';

export interface SendResult {
  success: boolean;
  errorMessage?: string;
  /** If true, this error is permanent and should not be retried */
  permanent?: boolean;
  /** Provider-specific message ID (e.g. Telegram message_id) */
  providerMessageId?: string;
}

export interface NotificationChannelProvider {
  readonly channel: NotificationChannel;

  send(
    recipientChatId: number,
    text: string,
    buttons?: { label: string; callbackData: string }[],
  ): Promise<SendResult>;
}

export const NOTIFICATION_CHANNELS = 'NOTIFICATION_CHANNELS';

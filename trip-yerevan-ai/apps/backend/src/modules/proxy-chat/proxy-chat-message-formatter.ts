import {
  MessageContentType,
  MessageSenderType,
  ProxyChatStatus,
} from '@prisma/client';

type Language = 'RU' | 'AM' | 'EN';

const STATUS_LABELS: Record<ProxyChatStatus, Record<Language, string>> = {
  OPEN: { RU: '🟢 ОТКРЫТ', AM: '🟢 OPEN', EN: '🟢 OPEN' },
  BOOKED: { RU: '📋 ЗАБРОНИРОВАНО', AM: '📋 BOOKED', EN: '📋 BOOKED' },
  MANAGER_ASSIGNED: { RU: '👤 МЕНЕДЖЕР', AM: '👤 MANAGER', EN: '👤 MANAGER' },
  COMPLETED: { RU: '✅ ЗАВЕРШЕНО', AM: '✅ COMPLETED', EN: '✅ COMPLETED' },
  CLOSED: { RU: '🔴 ЗАКРЫТ', AM: '🔴 CLOSED', EN: '🔴 CLOSED' },
  ARCHIVED: { RU: '📁 АРХИВ', AM: '📁 ARCHIVED', EN: '📁 ARCHIVED' },
};

export interface FormatMessageParams {
  senderType: MessageSenderType;
  senderLabel: string;
  isManager: boolean;
  content: string;
  contentType: MessageContentType;
  chatStatus: ProxyChatStatus;
  agencyName: string;
  language?: Language;
}

/**
 * Formats a forwarded proxy-chat message with a status header.
 *
 * Output:
 * ```
 * 🟢 OPEN | TravelCo Agency
 * ━━━━━━━━━━━━━━━━━
 * 💬 *Traveler:*
 * Hello, I have a question
 * ```
 */
export function formatForwardedMessage(params: FormatMessageParams): string {
  const lang = params.language ?? 'EN';
  const statusLabel = STATUS_LABELS[params.chatStatus]?.[lang] ?? STATUS_LABELS[params.chatStatus]?.EN ?? '🟢 OPEN';

  const senderPrefix =
    params.senderType === MessageSenderType.USER
      ? '💬 *Traveler:*'
      : params.isManager
        ? '👤 *Manager:*'
        : `🏢 *${params.senderLabel}:*`;

  const body =
    params.contentType === MessageContentType.TEXT
      ? params.content
      : params.contentType === MessageContentType.PHOTO
        ? '[Photo]'
        : '[Document]';

  return `${statusLabel} | ${params.agencyName}\n━━━━━━━━━━━━━━━━━\n${senderPrefix}\n${body}`;
}

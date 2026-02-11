import {
  MessageContentType,
  MessageSenderType,
  ProxyChatState,
} from '@prisma/client';

type Language = 'RU' | 'AM' | 'EN';

const STATE_LABELS: Record<ProxyChatState, Record<Language, string>> = {
  OPEN: { RU: '🟢 ОТКРЫТ', AM: '🟢 OPEN', EN: '🟢 OPEN' },
  REPLY_ONLY: { RU: '📋 ТОЛЬКО ОТВЕТ', AM: '📋 REPLY ONLY', EN: '📋 REPLY ONLY' },
  PAUSED: { RU: '⏸ ПАУЗА', AM: '⏸ PAUSED', EN: '⏸ PAUSED' },
  ESCALATED: { RU: '👤 МЕНЕДЖЕР', AM: '👤 ESCALATED', EN: '👤 ESCALATED' },
  CLOSED: { RU: '🔴 ЗАКРЫТ', AM: '🔴 CLOSED', EN: '🔴 CLOSED' },
};

export interface FormatMessageParams {
  senderType: MessageSenderType;
  senderLabel: string;
  isManager: boolean;
  content: string;
  contentType: MessageContentType;
  chatState: ProxyChatState;
  agencyName: string;
  language?: Language;
}

/**
 * Formats a forwarded proxy-chat message with a state header.
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
  const stateLabel = STATE_LABELS[params.chatState]?.[lang] ?? STATE_LABELS[params.chatState]?.EN ?? '🟢 OPEN';

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

  return `${stateLabel} | ${params.agencyName}\n━━━━━━━━━━━━━━━━━\n${senderPrefix}\n${body}`;
}

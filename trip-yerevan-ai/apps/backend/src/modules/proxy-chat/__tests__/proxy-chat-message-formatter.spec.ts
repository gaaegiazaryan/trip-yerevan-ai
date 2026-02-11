import { MessageContentType, MessageSenderType, ProxyChatState } from '@prisma/client';
import { formatForwardedMessage } from '../proxy-chat-message-formatter';

describe('formatForwardedMessage', () => {
  const baseParams = {
    senderType: MessageSenderType.USER,
    senderLabel: 'Traveler',
    isManager: false,
    content: 'Hello, I have a question',
    contentType: MessageContentType.TEXT,
    chatState: ProxyChatState.OPEN,
    agencyName: 'TravelCo',
    language: 'EN' as const,
  };

  it('should include OPEN state indicator', () => {
    const result = formatForwardedMessage(baseParams);
    expect(result).toContain('🟢 OPEN');
    expect(result).toContain('TravelCo');
    expect(result).toContain('Traveler');
    expect(result).toContain('Hello, I have a question');
  });

  it('should include CLOSED state indicator', () => {
    const result = formatForwardedMessage({
      ...baseParams,
      chatState: ProxyChatState.CLOSED,
    });
    expect(result).toContain('🔴 CLOSED');
  });

  it('should include REPLY_ONLY state indicator', () => {
    const result = formatForwardedMessage({
      ...baseParams,
      chatState: ProxyChatState.REPLY_ONLY,
    });
    expect(result).toContain('📋 REPLY ONLY');
  });

  it('should include PAUSED state indicator', () => {
    const result = formatForwardedMessage({
      ...baseParams,
      chatState: ProxyChatState.PAUSED,
    });
    expect(result).toContain('⏸ PAUSED');
  });

  it('should include ESCALATED state indicator', () => {
    const result = formatForwardedMessage({
      ...baseParams,
      chatState: ProxyChatState.ESCALATED,
    });
    expect(result).toContain('👤 ESCALATED');
  });

  it('should use Russian labels when language is RU', () => {
    const result = formatForwardedMessage({
      ...baseParams,
      language: 'RU',
    });
    expect(result).toContain('🟢 ОТКРЫТ');
  });

  it('should show [Photo] for photo content type', () => {
    const result = formatForwardedMessage({
      ...baseParams,
      contentType: MessageContentType.PHOTO,
    });
    expect(result).toContain('[Photo]');
    expect(result).not.toContain('Hello');
  });

  it('should show [Document] for document content type', () => {
    const result = formatForwardedMessage({
      ...baseParams,
      contentType: MessageContentType.DOCUMENT,
    });
    expect(result).toContain('[Document]');
  });

  it('should show agency sender prefix for AGENCY type', () => {
    const result = formatForwardedMessage({
      ...baseParams,
      senderType: MessageSenderType.AGENCY,
      senderLabel: 'TravelCo',
    });
    expect(result).toContain('🏢 *TravelCo:*');
  });

  it('should show manager prefix when isManager is true', () => {
    const result = formatForwardedMessage({
      ...baseParams,
      senderType: MessageSenderType.AGENCY,
      senderLabel: 'Admin',
      isManager: true,
    });
    expect(result).toContain('👤 *Manager:*');
  });

  it('should default to EN when language is not provided', () => {
    const { language, ...paramsWithoutLang } = baseParams;
    const result = formatForwardedMessage(paramsWithoutLang);
    expect(result).toContain('🟢 OPEN');
  });

  it('should include separator line', () => {
    const result = formatForwardedMessage(baseParams);
    expect(result).toContain('━━━━━━━━━━━━━━━━━');
  });
});

import { MessageContentType, MessageSenderType, ProxyChatStatus } from '@prisma/client';
import { formatForwardedMessage } from '../proxy-chat-message-formatter';

describe('formatForwardedMessage', () => {
  const baseParams = {
    senderType: MessageSenderType.USER,
    senderLabel: 'Traveler',
    isManager: false,
    content: 'Hello, I have a question',
    contentType: MessageContentType.TEXT,
    chatStatus: ProxyChatStatus.OPEN,
    agencyName: 'TravelCo',
    language: 'EN' as const,
  };

  it('should include OPEN status indicator', () => {
    const result = formatForwardedMessage(baseParams);
    expect(result).toContain('🟢 OPEN');
    expect(result).toContain('TravelCo');
    expect(result).toContain('Traveler');
    expect(result).toContain('Hello, I have a question');
  });

  it('should include CLOSED status indicator', () => {
    const result = formatForwardedMessage({
      ...baseParams,
      chatStatus: ProxyChatStatus.CLOSED,
    });
    expect(result).toContain('🔴 CLOSED');
  });

  it('should include BOOKED status indicator', () => {
    const result = formatForwardedMessage({
      ...baseParams,
      chatStatus: ProxyChatStatus.BOOKED,
    });
    expect(result).toContain('📋 BOOKED');
  });

  it('should include MANAGER_ASSIGNED status indicator', () => {
    const result = formatForwardedMessage({
      ...baseParams,
      chatStatus: ProxyChatStatus.MANAGER_ASSIGNED,
    });
    expect(result).toContain('👤 MANAGER');
  });

  it('should include COMPLETED status indicator', () => {
    const result = formatForwardedMessage({
      ...baseParams,
      chatStatus: ProxyChatStatus.COMPLETED,
    });
    expect(result).toContain('✅ COMPLETED');
  });

  it('should include ARCHIVED status indicator', () => {
    const result = formatForwardedMessage({
      ...baseParams,
      chatStatus: ProxyChatStatus.ARCHIVED,
    });
    expect(result).toContain('📁 ARCHIVED');
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

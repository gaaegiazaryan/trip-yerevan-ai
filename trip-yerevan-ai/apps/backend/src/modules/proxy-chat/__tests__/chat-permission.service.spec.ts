import { ChatPermissionService } from '../chat-permission.service';
import { MessageSenderType, ProxyChatState } from '@prisma/client';

describe('ChatPermissionService', () => {
  let service: ChatPermissionService;

  beforeEach(() => {
    service = new ChatPermissionService();
  });

  describe('OPEN state', () => {
    it('should allow USER', () => {
      const result = service.check(ProxyChatState.OPEN, MessageSenderType.USER, false);
      expect(result.allowed).toBe(true);
      expect(result.flagged).toBe(false);
    });

    it('should allow AGENCY', () => {
      const result = service.check(ProxyChatState.OPEN, MessageSenderType.AGENCY, false);
      expect(result.allowed).toBe(true);
      expect(result.flagged).toBe(false);
    });
  });

  describe('REPLY_ONLY state', () => {
    it('should allow USER with flag', () => {
      const result = service.check(ProxyChatState.REPLY_ONLY, MessageSenderType.USER, false);
      expect(result.allowed).toBe(true);
      expect(result.flagged).toBe(true);
    });

    it('should allow AGENCY with flag', () => {
      const result = service.check(ProxyChatState.REPLY_ONLY, MessageSenderType.AGENCY, false);
      expect(result.allowed).toBe(true);
      expect(result.flagged).toBe(true);
    });
  });

  describe('PAUSED state', () => {
    it('should allow USER with flag', () => {
      const result = service.check(ProxyChatState.PAUSED, MessageSenderType.USER, false);
      expect(result.allowed).toBe(true);
      expect(result.flagged).toBe(true);
    });

    it('should allow AGENCY with flag', () => {
      const result = service.check(ProxyChatState.PAUSED, MessageSenderType.AGENCY, false);
      expect(result.allowed).toBe(true);
      expect(result.flagged).toBe(true);
    });
  });

  describe('ESCALATED state', () => {
    it('should allow USER', () => {
      const result = service.check(
        ProxyChatState.ESCALATED,
        MessageSenderType.USER,
        false,
      );
      expect(result.allowed).toBe(true);
    });

    it('should block AGENCY (read-only)', () => {
      const result = service.check(
        ProxyChatState.ESCALATED,
        MessageSenderType.AGENCY,
        false,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('read-only');
    });

    it('should allow manager', () => {
      const result = service.check(
        ProxyChatState.ESCALATED,
        MessageSenderType.SYSTEM,
        true,
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe('CLOSED state', () => {
    it('should block USER', () => {
      const result = service.check(ProxyChatState.CLOSED, MessageSenderType.USER, false);
      expect(result.allowed).toBe(false);
    });

    it('should block AGENCY', () => {
      const result = service.check(ProxyChatState.CLOSED, MessageSenderType.AGENCY, false);
      expect(result.allowed).toBe(false);
    });

    it('should block manager', () => {
      const result = service.check(ProxyChatState.CLOSED, MessageSenderType.SYSTEM, true);
      expect(result.allowed).toBe(false);
    });
  });
});

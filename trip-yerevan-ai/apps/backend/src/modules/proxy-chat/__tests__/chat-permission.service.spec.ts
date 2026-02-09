import { ChatPermissionService } from '../chat-permission.service';
import { MessageSenderType, ProxyChatStatus } from '@prisma/client';

describe('ChatPermissionService', () => {
  let service: ChatPermissionService;

  beforeEach(() => {
    service = new ChatPermissionService();
  });

  describe('OPEN status', () => {
    it('should allow USER', () => {
      const result = service.check(ProxyChatStatus.OPEN, MessageSenderType.USER, false);
      expect(result.allowed).toBe(true);
      expect(result.flagged).toBe(false);
    });

    it('should allow AGENCY', () => {
      const result = service.check(ProxyChatStatus.OPEN, MessageSenderType.AGENCY, false);
      expect(result.allowed).toBe(true);
      expect(result.flagged).toBe(false);
    });
  });

  describe('BOOKED status', () => {
    it('should allow USER with flag', () => {
      const result = service.check(ProxyChatStatus.BOOKED, MessageSenderType.USER, false);
      expect(result.allowed).toBe(true);
      expect(result.flagged).toBe(true);
    });

    it('should allow AGENCY with flag', () => {
      const result = service.check(ProxyChatStatus.BOOKED, MessageSenderType.AGENCY, false);
      expect(result.allowed).toBe(true);
      expect(result.flagged).toBe(true);
    });
  });

  describe('MANAGER_ASSIGNED status', () => {
    it('should allow USER', () => {
      const result = service.check(
        ProxyChatStatus.MANAGER_ASSIGNED,
        MessageSenderType.USER,
        false,
      );
      expect(result.allowed).toBe(true);
    });

    it('should block AGENCY (read-only)', () => {
      const result = service.check(
        ProxyChatStatus.MANAGER_ASSIGNED,
        MessageSenderType.AGENCY,
        false,
      );
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('read-only');
    });

    it('should allow manager', () => {
      const result = service.check(
        ProxyChatStatus.MANAGER_ASSIGNED,
        MessageSenderType.SYSTEM,
        true,
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe('COMPLETED status', () => {
    it('should allow USER with flag', () => {
      const result = service.check(ProxyChatStatus.COMPLETED, MessageSenderType.USER, false);
      expect(result.allowed).toBe(true);
      expect(result.flagged).toBe(true);
    });

    it('should allow AGENCY with flag', () => {
      const result = service.check(ProxyChatStatus.COMPLETED, MessageSenderType.AGENCY, false);
      expect(result.allowed).toBe(true);
      expect(result.flagged).toBe(true);
    });

    it('should allow manager with flag', () => {
      const result = service.check(ProxyChatStatus.COMPLETED, MessageSenderType.SYSTEM, true);
      expect(result.allowed).toBe(true);
      expect(result.flagged).toBe(true);
    });
  });

  describe('CLOSED status', () => {
    it('should block USER', () => {
      const result = service.check(ProxyChatStatus.CLOSED, MessageSenderType.USER, false);
      expect(result.allowed).toBe(false);
    });

    it('should block AGENCY', () => {
      const result = service.check(ProxyChatStatus.CLOSED, MessageSenderType.AGENCY, false);
      expect(result.allowed).toBe(false);
    });

    it('should block manager', () => {
      const result = service.check(ProxyChatStatus.CLOSED, MessageSenderType.SYSTEM, true);
      expect(result.allowed).toBe(false);
    });
  });

  describe('ARCHIVED status', () => {
    it('should block everyone', () => {
      const result = service.check(ProxyChatStatus.ARCHIVED, MessageSenderType.USER, false);
      expect(result.allowed).toBe(false);
    });
  });
});

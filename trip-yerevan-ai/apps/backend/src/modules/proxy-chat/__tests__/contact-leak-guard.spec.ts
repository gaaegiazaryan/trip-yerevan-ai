import { ContactLeakGuard } from '../contact-leak-guard';

describe('ContactLeakGuard', () => {
  let guard: ContactLeakGuard;

  beforeEach(() => {
    guard = new ContactLeakGuard();
  });

  describe('clean messages', () => {
    it('should allow normal text', () => {
      const result = guard.check('What is the check-in time?');
      expect(result.blocked).toBe(false);
      expect(result.violations).toHaveLength(0);
      expect(result.warningMessage).toBeNull();
    });

    it('should allow prices (not false-positive on numbers)', () => {
      const result = guard.check('The tour costs $1,500 per person');
      expect(result.blocked).toBe(false);
    });

    it('should allow dates', () => {
      const result = guard.check('Check-in on 15.03.2026');
      expect(result.blocked).toBe(false);
    });

    it('should allow short numbers (room 205, 3 nights)', () => {
      const result = guard.check('Room 205, 3 nights, 2 adults');
      expect(result.blocked).toBe(false);
    });

    it('should allow times', () => {
      const result = guard.check('Flight at 14:30');
      expect(result.blocked).toBe(false);
    });
  });

  describe('phone numbers', () => {
    it('should block international phone numbers', () => {
      const result = guard.check('Call me at +37491234567');
      expect(result.blocked).toBe(true);
      expect(result.violations).toContain('phone_number');
    });

    it('should block spaced phone numbers with 7+ digits', () => {
      const result = guard.check('My number is 091 23 45 67');
      expect(result.blocked).toBe(true);
      expect(result.violations).toContain('phone_number');
    });

    it('should block parenthesized phone numbers', () => {
      const result = guard.check('Call (374) 91-234-567');
      expect(result.blocked).toBe(true);
      expect(result.violations).toContain('phone_number');
    });
  });

  describe('emails', () => {
    it('should block email addresses', () => {
      const result = guard.check('Write to me at user@example.com');
      expect(result.blocked).toBe(true);
      expect(result.violations).toContain('email');
    });
  });

  describe('usernames', () => {
    it('should block @username mentions', () => {
      const result = guard.check('Message me @my_username');
      expect(result.blocked).toBe(true);
      expect(result.violations).toContain('username');
    });

    it('should not block short @mentions (less than 4 chars)', () => {
      const result = guard.check('Hey @ab check this');
      expect(result.blocked).toBe(false);
    });
  });

  describe('URLs', () => {
    it('should block http URLs', () => {
      const result = guard.check('Visit http://example.com');
      expect(result.blocked).toBe(true);
      expect(result.violations).toContain('url');
    });

    it('should block https URLs', () => {
      const result = guard.check('See https://example.com/page');
      expect(result.blocked).toBe(true);
      expect(result.violations).toContain('url');
    });

    it('should block www URLs', () => {
      const result = guard.check('Go to www.example.com');
      expect(result.blocked).toBe(true);
      expect(result.violations).toContain('url');
    });
  });

  describe('WhatsApp', () => {
    it('should block WhatsApp mentions (English)', () => {
      const result = guard.check('Add me on WhatsApp');
      expect(result.blocked).toBe(true);
      expect(result.violations).toContain('whatsapp');
    });

    it('should block WhatsApp mentions (Russian)', () => {
      const result = guard.check('Пишите мне в вацап');
      expect(result.blocked).toBe(true);
      expect(result.violations).toContain('whatsapp');
    });

    it('should block wa.me links', () => {
      const result = guard.check('wa.me/37491234567');
      expect(result.blocked).toBe(true);
      expect(result.violations).toContain('whatsapp');
    });
  });

  describe('social handles', () => {
    it('should block Instagram mentions', () => {
      const result = guard.check('Follow me on instagram');
      expect(result.blocked).toBe(true);
      expect(result.violations).toContain('social_handle');
    });

    it('should block Viber mentions', () => {
      const result = guard.check('Write me on viber');
      expect(result.blocked).toBe(true);
      expect(result.violations).toContain('social_handle');
    });

    it('should block Telegram mentions (Russian)', () => {
      const result = guard.check('Пишите в телеграм');
      expect(result.blocked).toBe(true);
      expect(result.violations).toContain('social_handle');
    });

    it('should block VK mentions', () => {
      const result = guard.check('Find me at vk.com/user');
      expect(result.blocked).toBe(true);
      expect(result.violations).toContain('social_handle');
    });
  });

  describe('warning messages', () => {
    it('should return RU warning by default', () => {
      const result = guard.check('+37491234567');
      expect(result.warningMessage).toContain('заблокировано');
    });

    it('should return EN warning when specified', () => {
      const result = guard.check('+37491234567', 'EN');
      expect(result.warningMessage).toContain('blocked');
    });
  });

  describe('multiple violations', () => {
    it('should detect multiple violation types', () => {
      const result = guard.check('Call +37491234567 or email me@test.com');
      expect(result.blocked).toBe(true);
      expect(result.violations).toContain('phone_number');
      expect(result.violations).toContain('email');
    });
  });
});

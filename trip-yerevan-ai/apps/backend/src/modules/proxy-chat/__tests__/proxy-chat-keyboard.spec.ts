import {
  buildTravelerKeyboard,
  buildAgencyKeyboard,
  buildManagerKeyboard,
} from '../proxy-chat-keyboard';
import {
  KB_EXIT_CHAT,
  KB_BOOKING_DETAILS,
  KB_CHAT_DETAILS,
  KB_CONTACT_MANAGER,
} from '../proxy-chat.constants';

describe('proxy-chat-keyboard', () => {
  describe('buildTravelerKeyboard', () => {
    it('should contain booking details, contact manager, and exit buttons', () => {
      const kb = buildTravelerKeyboard();
      const rows = kb.build();
      const allLabels = rows.flat().map((b) => (b as any).text);

      expect(allLabels).toContain(KB_BOOKING_DETAILS);
      expect(allLabels).toContain(KB_CONTACT_MANAGER);
      expect(allLabels).toContain(KB_EXIT_CHAT);
      expect(allLabels).toHaveLength(3);
    });

    it('should place exit button on its own row', () => {
      const rows = buildTravelerKeyboard().build();
      // Last row should have only the exit button
      const lastRow = rows[rows.length - 1];
      expect(lastRow).toHaveLength(1);
      expect((lastRow[0] as any).text).toBe(KB_EXIT_CHAT);
    });
  });

  describe('buildAgencyKeyboard', () => {
    it('should contain chat details and exit buttons', () => {
      const rows = buildAgencyKeyboard().build();
      const allLabels = rows.flat().map((b) => (b as any).text);

      expect(allLabels).toContain(KB_CHAT_DETAILS);
      expect(allLabels).toContain(KB_EXIT_CHAT);
      expect(allLabels).toHaveLength(2);
    });

    it('should NOT contain contact manager button', () => {
      const rows = buildAgencyKeyboard().build();
      const allLabels = rows.flat().map((b) => (b as any).text);

      expect(allLabels).not.toContain(KB_CONTACT_MANAGER);
    });
  });

  describe('buildManagerKeyboard', () => {
    it('should contain only exit button', () => {
      const rows = buildManagerKeyboard().build();
      const allLabels = rows.flat().map((b) => (b as any).text);

      expect(allLabels).toContain(KB_EXIT_CHAT);
      expect(allLabels).toHaveLength(1);
    });
  });
});

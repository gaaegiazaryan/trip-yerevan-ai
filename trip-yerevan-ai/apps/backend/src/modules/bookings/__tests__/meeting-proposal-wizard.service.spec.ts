import { MeetingProposalWizardService } from '../meeting-proposal-wizard.service';
import { MeetingProposalWizardSection } from '../meeting-proposal-wizard.types';

describe('MeetingProposalWizardService', () => {
  let service: MeetingProposalWizardService;

  beforeEach(() => {
    service = new MeetingProposalWizardService();
  });

  describe('start', () => {
    it('should initialize wizard with DATE section', () => {
      const result = service.start(12345, 'booking-001');

      expect(result.text).toContain('Propose Meeting Date');
      expect(result.buttons).toBeDefined();
      expect(result.buttons!.length).toBe(14); // 14 days
      expect(service.isActive(12345)).toBe(true);
    });

    it('should pre-fill values for counter-proposals', () => {
      service.start(12345, 'booking-001', true, 'prop-001', {
        date: '2026-03-15',
        time: '14:00',
        location: 'Zoom',
      });

      expect(service.isActive(12345)).toBe(true);
      const state = service.getState(12345);
      expect(state?.isCounterProposal).toBe(true);
      expect(state?.originalProposalId).toBe('prop-001');
      expect(state?.draft.date).toBe('2026-03-15');
      expect(state?.draft.time).toBe('14:00');
      expect(state?.draft.location).toBe('Zoom');
    });
  });

  describe('handleCallback — date selection', () => {
    it('should advance to TIME section after date selection', () => {
      service.start(12345, 'booking-001');

      // Pick a date (tomorrow)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const y = tomorrow.getFullYear();
      const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const d = String(tomorrow.getDate()).padStart(2, '0');

      const result = service.handleCallback(
        12345,
        `mpw:d:${y}-${m}-${d}`,
      );

      expect(result.text).toContain('Select Meeting Time');
      expect(result.buttons).toBeDefined();
      // 7 presets + custom
      expect(result.buttons!.length).toBe(8);
    });

    it('should reject past dates', () => {
      service.start(12345, 'booking-001');

      const result = service.handleCallback(12345, 'mpw:d:2020-01-01');

      expect(result.text).toContain('future');
    });
  });

  describe('handleCallback — time selection', () => {
    beforeEach(() => {
      service.start(12345, 'booking-001');
      // Advance to TIME
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const y = tomorrow.getFullYear();
      const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const d = String(tomorrow.getDate()).padStart(2, '0');
      service.handleCallback(12345, `mpw:d:${y}-${m}-${d}`);
    });

    it('should advance to LOCATION after time preset', () => {
      const result = service.handleCallback(12345, 'mpw:t:14:00');

      expect(result.text).toContain('Meeting Location');
      expect(result.buttons).toBeDefined();
    });

    it('should prompt for text input on custom time', () => {
      const result = service.handleCallback(12345, 'mpw:t:custom');

      expect(result.text).toContain('type the meeting time');
    });
  });

  describe('handleTextInput — custom time', () => {
    beforeEach(() => {
      service.start(12345, 'booking-001');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const y = tomorrow.getFullYear();
      const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const d = String(tomorrow.getDate()).padStart(2, '0');
      service.handleCallback(12345, `mpw:d:${y}-${m}-${d}`);
      service.handleCallback(12345, 'mpw:t:custom');
    });

    it('should accept valid custom time', () => {
      const result = service.handleTextInput(12345, '13:30');

      expect(result.text).toContain('Meeting Location');
    });

    it('should reject invalid time format', () => {
      const result = service.handleTextInput(12345, 'not-a-time');

      expect(result.text).toContain('Invalid time');
    });
  });

  describe('handleCallback — location selection', () => {
    beforeEach(() => {
      service.start(12345, 'booking-001');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const y = tomorrow.getFullYear();
      const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const d = String(tomorrow.getDate()).padStart(2, '0');
      service.handleCallback(12345, `mpw:d:${y}-${m}-${d}`);
      service.handleCallback(12345, 'mpw:t:14:00');
    });

    it('should advance to NOTES after location preset', () => {
      const result = service.handleCallback(12345, 'mpw:l:Our Office');

      expect(result.text).toContain('Additional Notes');
    });

    it('should prompt for text input on custom location', () => {
      const result = service.handleCallback(12345, 'mpw:l:custom');

      expect(result.text).toContain('type the meeting location');
    });
  });

  describe('handleCallback — notes', () => {
    beforeEach(() => {
      service.start(12345, 'booking-001');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const y = tomorrow.getFullYear();
      const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const d = String(tomorrow.getDate()).padStart(2, '0');
      service.handleCallback(12345, `mpw:d:${y}-${m}-${d}`);
      service.handleCallback(12345, 'mpw:t:14:00');
      service.handleCallback(12345, 'mpw:l:Our Office');
    });

    it('should advance to CONFIRM on skip', () => {
      const result = service.handleCallback(12345, 'mpw:n:skip');

      expect(result.text).toContain('Meeting Proposal Summary');
      expect(result.buttons).toBeDefined();
      expect(result.buttons!.some((b) => b.callbackData === 'mpw:send')).toBe(
        true,
      );
    });

    it('should accept text notes input', () => {
      const result = service.handleTextInput(12345, 'Bring passport');

      expect(result.text).toContain('Meeting Proposal Summary');
    });
  });

  describe('confirm section', () => {
    function advanceToConfirm() {
      service.start(12345, 'booking-001');
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const y = tomorrow.getFullYear();
      const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const d = String(tomorrow.getDate()).padStart(2, '0');
      service.handleCallback(12345, `mpw:d:${y}-${m}-${d}`);
      service.handleCallback(12345, 'mpw:t:14:00');
      service.handleCallback(12345, 'mpw:l:Our Office');
      service.handleCallback(12345, 'mpw:n:skip');
    }

    it('should show summary with edit and send buttons', () => {
      advanceToConfirm();
      const state = service.getState(12345);

      expect(state?.section).toBe(MeetingProposalWizardSection.CONFIRM);
    });

    it('should return done=true and proposal on send', () => {
      advanceToConfirm();

      const result = service.handleCallback(12345, 'mpw:send');

      expect(result.done).toBe(true);
      expect(result.proposal).toBeDefined();
      expect(result.proposal!.bookingId).toBe('booking-001');
      expect(result.proposal!.time).toBe('14:00');
      expect(result.proposal!.location).toBe('Our Office');
      expect(service.isActive(12345)).toBe(false);
    });

    it('should return to correct section on edit', () => {
      advanceToConfirm();

      const result = service.handleCallback(12345, 'mpw:edit:TIME');

      expect(result.text).toContain('Select Meeting Time');

      const state = service.getState(12345);
      expect(state?.editingFromConfirm).toBe(true);
    });

    it('should return to confirm after editing', () => {
      advanceToConfirm();

      // Edit time
      service.handleCallback(12345, 'mpw:edit:TIME');
      const result = service.handleCallback(12345, 'mpw:t:16:00');

      expect(result.text).toContain('Meeting Proposal Summary');
      const state = service.getState(12345);
      expect(state?.draft.time).toBe('16:00');
    });
  });

  describe('cancel', () => {
    it('should clear state on cancel callback', () => {
      service.start(12345, 'booking-001');

      const result = service.handleCallback(12345, 'mpw:cancel');

      expect(result.text).toContain('cancelled');
      expect(service.isActive(12345)).toBe(false);
    });

    it('should clear state on cancel() method', () => {
      service.start(12345, 'booking-001');
      service.cancel(12345);

      expect(service.isActive(12345)).toBe(false);
    });
  });

  describe('isActive', () => {
    it('should return false when no wizard is active', () => {
      expect(service.isActive(99999)).toBe(false);
    });

    it('should return true when wizard is active', () => {
      service.start(12345, 'booking-001');
      expect(service.isActive(12345)).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should return error when no active wizard on callback', () => {
      const result = service.handleCallback(99999, 'mpw:d:2026-03-15');

      expect(result.text).toContain('No active proposal wizard');
    });

    it('should return error when no active wizard on text input', () => {
      const result = service.handleTextInput(99999, 'Hello');

      expect(result.text).toContain('No active proposal wizard');
    });

    it('should handle unknown callback action', () => {
      service.start(12345, 'booking-001');

      const result = service.handleCallback(12345, 'mpw:unknown:data');

      expect(result.text).toContain('Unknown wizard action');
    });
  });
});

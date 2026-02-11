import { MeetingProposalCallbackHandler } from '../meeting-proposal-callback.handler';
import {
  UserRole,
  MeetingProposalStatus,
  MeetingProposer,
} from '@prisma/client';

function createMockPrisma() {
  return {
    meetingProposal: {
      findUnique: jest.fn(),
    },
  };
}

function createMockProposalService() {
  return {
    acceptProposal: jest.fn().mockResolvedValue({
      success: true,
      meetingId: 'mtg-001',
      notifications: [{ chatId: 12345, text: 'Payment pending' }],
    }),
    rejectProposal: jest.fn().mockResolvedValue({
      success: true,
      notifications: [{ chatId: 12345, text: 'Proposal rejected' }],
    }),
    counterProposal: jest.fn().mockResolvedValue({
      success: true,
      proposalId: 'prop-002',
      notifications: [],
    }),
  };
}

function createMockWizardService() {
  return {
    start: jest.fn().mockReturnValue({
      text: 'Select date',
      buttons: [{ label: 'Mon 15 Mar', callbackData: 'mpw:d:2026-03-15' }],
    }),
  };
}

describe('MeetingProposalCallbackHandler', () => {
  let handler: MeetingProposalCallbackHandler;
  let prisma: ReturnType<typeof createMockPrisma>;
  let proposalService: ReturnType<typeof createMockProposalService>;
  let wizardService: ReturnType<typeof createMockWizardService>;

  const mockProposal = {
    id: 'prop-001',
    status: MeetingProposalStatus.PENDING,
    proposerRole: MeetingProposer.USER,
    proposedDate: new Date('2026-03-15T14:00:00Z'),
    proposedLocation: 'Our Office',
    notes: 'Bring passport',
    booking: {
      id: 'booking-001',
      userId: 'user-001',
      user: { telegramId: BigInt(12345), firstName: 'John' },
    },
  };

  beforeEach(() => {
    prisma = createMockPrisma();
    proposalService = createMockProposalService();
    wizardService = createMockWizardService();
    handler = new MeetingProposalCallbackHandler(
      prisma as any,
      proposalService as any,
      wizardService as any,
    );

    prisma.meetingProposal.findUnique.mockResolvedValue(mockProposal);
  });

  describe('accept', () => {
    it('should accept proposal when manager responds to USER proposal', async () => {
      const result = await handler.handleCallback(
        'mpr:accept:prop-001',
        'manager-001',
        UserRole.MANAGER,
        55555,
      );

      expect(proposalService.acceptProposal).toHaveBeenCalledWith(
        'prop-001',
        'manager-001',
      );
      expect(result.text).toContain('Meeting Confirmed');
      expect(result.notifications).toHaveLength(1);
    });

    it('should reject if traveler tries to accept their own USER proposal', async () => {
      const result = await handler.handleCallback(
        'mpr:accept:prop-001',
        'user-001',
        UserRole.TRAVELER,
        12345,
      );

      expect(result.text).toContain('Only managers');
      expect(proposalService.acceptProposal).not.toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('should reject proposal when manager responds', async () => {
      const result = await handler.handleCallback(
        'mpr:reject:prop-001',
        'manager-001',
        UserRole.MANAGER,
        55555,
      );

      expect(proposalService.rejectProposal).toHaveBeenCalledWith(
        'prop-001',
        'manager-001',
      );
      expect(result.text).toContain('Proposal rejected');
      expect(result.notifications).toHaveLength(1);
    });
  });

  describe('counter', () => {
    it('should start wizard for counter-proposal', async () => {
      const result = await handler.handleCallback(
        'mpr:counter:prop-001',
        'manager-001',
        UserRole.MANAGER,
        55555,
      );

      // Date extraction uses local time, so we derive expected values the same way
      const proposedDate = new Date('2026-03-15T14:00:00Z');
      const expectedH = String(proposedDate.getHours()).padStart(2, '0');
      const expectedM = String(proposedDate.getMinutes()).padStart(2, '0');

      expect(wizardService.start).toHaveBeenCalledWith(
        55555,
        'booking-001',
        true,
        'prop-001',
        expect.objectContaining({
          date: '2026-03-15',
          time: `${expectedH}:${expectedM}`,
          location: 'Our Office',
        }),
      );
      expect(result.wizardStarted).toBe(true);
      expect(result.text).toContain('Select date');
    });
  });

  describe('auth — manager proposal', () => {
    it('should allow traveler to respond to MANAGER proposal', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        ...mockProposal,
        proposerRole: MeetingProposer.MANAGER,
      });

      const result = await handler.handleCallback(
        'mpr:accept:prop-001',
        'user-001',
        UserRole.TRAVELER,
        12345,
      );

      expect(proposalService.acceptProposal).toHaveBeenCalled();
      expect(result.text).toContain('Meeting Confirmed');
    });

    it('should reject non-owner traveler responding to MANAGER proposal', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        ...mockProposal,
        proposerRole: MeetingProposer.MANAGER,
      });

      const result = await handler.handleCallback(
        'mpr:accept:prop-001',
        'user-other',
        UserRole.TRAVELER,
        99999,
      );

      expect(result.text).toContain('Only the booking owner');
      expect(proposalService.acceptProposal).not.toHaveBeenCalled();
    });
  });

  describe('reject — traveler rejects MANAGER proposal', () => {
    it('should allow booking owner to reject MANAGER proposal', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        ...mockProposal,
        proposerRole: MeetingProposer.MANAGER,
      });

      const result = await handler.handleCallback(
        'mpr:reject:prop-001',
        'user-001',
        UserRole.TRAVELER,
        12345,
      );

      expect(proposalService.rejectProposal).toHaveBeenCalledWith(
        'prop-001',
        'user-001',
      );
      expect(result.text).toContain('Proposal rejected');
    });

    it('should reject if non-owner traveler tries to reject MANAGER proposal', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        ...mockProposal,
        proposerRole: MeetingProposer.MANAGER,
      });

      const result = await handler.handleCallback(
        'mpr:reject:prop-001',
        'user-other',
        UserRole.TRAVELER,
        99999,
      );

      expect(result.text).toContain('Only the booking owner');
      expect(proposalService.rejectProposal).not.toHaveBeenCalled();
    });
  });

  describe('counter — traveler counters MANAGER proposal', () => {
    it('should allow booking owner to counter MANAGER proposal', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        ...mockProposal,
        proposerRole: MeetingProposer.MANAGER,
      });

      const result = await handler.handleCallback(
        'mpr:counter:prop-001',
        'user-001',
        UserRole.TRAVELER,
        12345,
      );

      expect(wizardService.start).toHaveBeenCalledWith(
        12345,
        'booking-001',
        true,
        'prop-001',
        expect.any(Object),
      );
      expect(result.wizardStarted).toBe(true);
    });

    it('should reject non-owner traveler countering MANAGER proposal', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        ...mockProposal,
        proposerRole: MeetingProposer.MANAGER,
      });

      const result = await handler.handleCallback(
        'mpr:counter:prop-001',
        'user-other',
        UserRole.TRAVELER,
        99999,
      );

      expect(result.text).toContain('Only the booking owner');
      expect(wizardService.start).not.toHaveBeenCalled();
    });
  });

  describe('permission — admin role', () => {
    it('should allow ADMIN to accept USER proposal', async () => {
      const result = await handler.handleCallback(
        'mpr:accept:prop-001',
        'admin-001',
        UserRole.ADMIN,
        77777,
      );

      expect(proposalService.acceptProposal).toHaveBeenCalledWith(
        'prop-001',
        'admin-001',
      );
      expect(result.text).toContain('Meeting Confirmed');
    });

    it('should allow ADMIN to counter USER proposal', async () => {
      const result = await handler.handleCallback(
        'mpr:counter:prop-001',
        'admin-001',
        UserRole.ADMIN,
        77777,
      );

      expect(wizardService.start).toHaveBeenCalled();
      expect(result.wizardStarted).toBe(true);
    });
  });

  describe('stale proposals', () => {
    it('should return specific message for COUNTER_PROPOSED status', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        ...mockProposal,
        status: MeetingProposalStatus.COUNTER_PROPOSED,
      });

      const result = await handler.handleCallback(
        'mpr:accept:prop-001',
        'manager-001',
        UserRole.MANAGER,
        55555,
      );

      expect(result.text).toContain('counter proposed');
      expect(proposalService.acceptProposal).not.toHaveBeenCalled();
    });

    it('should return specific message for EXPIRED status', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        ...mockProposal,
        status: MeetingProposalStatus.EXPIRED,
      });

      const result = await handler.handleCallback(
        'mpr:reject:prop-001',
        'manager-001',
        UserRole.MANAGER,
        55555,
      );

      expect(result.text).toContain('expired');
      expect(proposalService.rejectProposal).not.toHaveBeenCalled();
    });

    it('should return specific message for REJECTED status', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        ...mockProposal,
        status: MeetingProposalStatus.REJECTED,
      });

      const result = await handler.handleCallback(
        'mpr:counter:prop-001',
        'manager-001',
        UserRole.MANAGER,
        55555,
      );

      expect(result.text).toContain('rejected');
      expect(wizardService.start).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should return error for unknown action', async () => {
      const result = await handler.handleCallback(
        'mpr:unknown:prop-001',
        'manager-001',
        UserRole.MANAGER,
        55555,
      );

      expect(result.text).toBe('Unknown proposal action.');
    });

    it('should return error when proposal not found', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue(null);

      const result = await handler.handleCallback(
        'mpr:accept:nonexistent',
        'manager-001',
        UserRole.MANAGER,
        55555,
      );

      expect(result.text).toBe('Proposal not found.');
    });

    it('should return error when proposal already responded', async () => {
      prisma.meetingProposal.findUnique.mockResolvedValue({
        ...mockProposal,
        status: MeetingProposalStatus.ACCEPTED,
      });

      const result = await handler.handleCallback(
        'mpr:accept:prop-001',
        'manager-001',
        UserRole.MANAGER,
        55555,
      );

      expect(result.text).toContain('already been accepted');
    });

    it('should return error for invalid callback data (no proposalId)', async () => {
      const result = await handler.handleCallback(
        'mpr:accept',
        'manager-001',
        UserRole.MANAGER,
        55555,
      );

      expect(result.text).toBe('Invalid callback data.');
    });
  });
});

import { AgencyApplicationService } from '../agency-application.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { AgencyWizardStep } from '../agency-wizard.types';
import { AgencyApplicationStatus, AgencyStatus } from '@prisma/client';

function createMockPrisma() {
  return {
    agency: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    agencyApplication: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    agencyMembership: {
      create: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

describe('AgencyApplicationService', () => {
  let service: AgencyApplicationService;
  let prisma: ReturnType<typeof createMockPrisma>;

  const CHAT_ID = 123456789;
  const USER_ID = 'user-applicant-001';

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new AgencyApplicationService(
      prisma as unknown as PrismaService,
    );
  });

  // -------------------------------------------------------------------------
  // Start / resume
  // -------------------------------------------------------------------------

  describe('startOrResume', () => {
    it('should return approved message if agency already exists and is approved', async () => {
      prisma.agency.findFirst.mockResolvedValue({
        name: 'Test Agency',
        status: AgencyStatus.APPROVED,
      });

      const result = await service.startOrResume(CHAT_ID, USER_ID);
      expect(result.text).toContain('approved');
      expect(result.text).toContain('Test Agency');
      expect(service.hasActiveWizard(CHAT_ID)).toBe(false);
    });

    it('should return under-review message if pending application exists', async () => {
      prisma.agency.findFirst.mockResolvedValue(null);
      prisma.agencyApplication.findFirst.mockResolvedValue({
        id: 'app-001',
        status: AgencyApplicationStatus.SUBMITTED,
      });

      const result = await service.startOrResume(CHAT_ID, USER_ID);
      expect(result.text).toContain('under review');
      expect(service.hasActiveWizard(CHAT_ID)).toBe(false);
    });

    it('should start wizard when no existing agency or application', async () => {
      prisma.agency.findFirst.mockResolvedValue(null);
      prisma.agencyApplication.findFirst.mockResolvedValue(null);

      const result = await service.startOrResume(CHAT_ID, USER_ID);
      expect(result.text).toContain('Agency Registration');
      expect(result.text).toContain('agency name');
      expect(service.hasActiveWizard(CHAT_ID)).toBe(true);
    });

    it('should resume existing wizard at current step', async () => {
      prisma.agency.findFirst.mockResolvedValue(null);
      prisma.agencyApplication.findFirst.mockResolvedValue(null);

      // Start wizard first
      await service.startOrResume(CHAT_ID, USER_ID);

      // Resume should return the same step
      const result = await service.startOrResume(CHAT_ID, USER_ID);
      expect(result.text).toContain('agency name');
    });
  });

  // -------------------------------------------------------------------------
  // Name input
  // -------------------------------------------------------------------------

  describe('handleTextInput — name', () => {
    beforeEach(async () => {
      prisma.agency.findFirst.mockResolvedValue(null);
      prisma.agencyApplication.findFirst.mockResolvedValue(null);
      await service.startOrResume(CHAT_ID, USER_ID);
    });

    it('should accept a valid name and advance to phone step', async () => {
      const result = await service.handleTextInput(CHAT_ID, 'My Travel Co');
      expect(result.text).toContain('My Travel Co');
      expect(result.text).toContain('phone number');
    });

    it('should reject a name that is too short', async () => {
      const result = await service.handleTextInput(CHAT_ID, 'X');
      expect(result.text).toContain('at least 2 characters');
    });

    it('should reject a name that is too long', async () => {
      const result = await service.handleTextInput(CHAT_ID, 'A'.repeat(101));
      expect(result.text).toContain('100 characters or less');
    });
  });

  // -------------------------------------------------------------------------
  // Phone input
  // -------------------------------------------------------------------------

  describe('handleTextInput — phone', () => {
    beforeEach(async () => {
      prisma.agency.findFirst.mockResolvedValue(null);
      prisma.agencyApplication.findFirst.mockResolvedValue(null);
      await service.startOrResume(CHAT_ID, USER_ID);
      await service.handleTextInput(CHAT_ID, 'Test Agency');
    });

    it('should accept a valid phone and advance to specializations', async () => {
      const result = await service.handleTextInput(CHAT_ID, '+37491123456');
      expect(result.text).toContain('specializations');
      expect(result.buttons).toBeDefined();
      expect(result.buttons!.length).toBeGreaterThan(0);
    });

    it('should reject an invalid phone format', async () => {
      const result = await service.handleTextInput(CHAT_ID, 'abc');
      expect(result.text).toContain('Invalid phone number');
    });

    it('should accept phone with spaces/dashes after stripping', async () => {
      const result = await service.handleTextInput(CHAT_ID, '+374 91-123456');
      expect(result.text).toContain('specializations');
    });
  });

  // -------------------------------------------------------------------------
  // Specialization toggle
  // -------------------------------------------------------------------------

  describe('handleCallback — specializations', () => {
    beforeEach(async () => {
      prisma.agency.findFirst.mockResolvedValue(null);
      prisma.agencyApplication.findFirst.mockResolvedValue(null);
      await service.startOrResume(CHAT_ID, USER_ID);
      await service.handleTextInput(CHAT_ID, 'Test Agency');
      await service.handleTextInput(CHAT_ID, '+37491123456');
    });

    it('should toggle a specialization on', async () => {
      const result = await service.handleCallback(
        CHAT_ID,
        'agency:spec:PACKAGE',
      );
      expect(result.text).toContain('Selected');
      expect(result.text).toContain('Package tours');
    });

    it('should toggle a specialization off', async () => {
      await service.handleCallback(CHAT_ID, 'agency:spec:PACKAGE');
      const result = await service.handleCallback(
        CHAT_ID,
        'agency:spec:PACKAGE',
      );
      expect(result.text).not.toContain('Selected');
    });

    it('should advance to countries on done', async () => {
      const result = await service.handleCallback(
        CHAT_ID,
        'agency:spec:done',
      );
      expect(result.text).toContain('countries');
      expect(result.buttons).toBeDefined();
    });

    it('should reject invalid specialization', async () => {
      const result = await service.handleCallback(
        CHAT_ID,
        'agency:spec:INVALID',
      );
      expect(result.text).toContain('Invalid specialization');
    });
  });

  // -------------------------------------------------------------------------
  // Country toggle
  // -------------------------------------------------------------------------

  describe('handleCallback — countries', () => {
    beforeEach(async () => {
      prisma.agency.findFirst.mockResolvedValue(null);
      prisma.agencyApplication.findFirst.mockResolvedValue(null);
      await service.startOrResume(CHAT_ID, USER_ID);
      await service.handleTextInput(CHAT_ID, 'Test Agency');
      await service.handleTextInput(CHAT_ID, '+37491123456');
      await service.handleCallback(CHAT_ID, 'agency:spec:done');
    });

    it('should toggle a country on', async () => {
      const result = await service.handleCallback(
        CHAT_ID,
        'agency:country:Armenia',
      );
      expect(result.text).toContain('Selected');
      expect(result.text).toContain('Armenia');
    });

    it('should advance to confirm on done', async () => {
      const result = await service.handleCallback(
        CHAT_ID,
        'agency:country:done',
      );
      expect(result.text).toContain('Review your agency application');
      expect(result.buttons).toBeDefined();
      expect(result.buttons!.some((b) => b.callbackData === 'agency:submit')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  describe('handleCallback — submit', () => {
    beforeEach(async () => {
      prisma.agency.findFirst.mockResolvedValue(null);
      prisma.agencyApplication.findFirst.mockResolvedValue(null);
      await service.startOrResume(CHAT_ID, USER_ID);
      await service.handleTextInput(CHAT_ID, 'Test Agency');
      await service.handleTextInput(CHAT_ID, '+37491123456');
      await service.handleCallback(CHAT_ID, 'agency:spec:PACKAGE');
      await service.handleCallback(CHAT_ID, 'agency:spec:done');
      await service.handleCallback(CHAT_ID, 'agency:country:Armenia');
      await service.handleCallback(CHAT_ID, 'agency:country:done');
    });

    it('should create application on submit', async () => {
      prisma.agency.findUnique.mockResolvedValue(null);
      prisma.agencyApplication.create.mockResolvedValue({ id: 'app-001' });

      const result = await service.handleCallback(CHAT_ID, 'agency:submit');
      expect(result.text).toContain('submitted successfully');
      expect(prisma.agencyApplication.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          applicantUserId: USER_ID,
          status: AgencyApplicationStatus.SUBMITTED,
          draftData: expect.objectContaining({
            name: 'Test Agency',
            phone: '+37491123456',
            specializations: ['PACKAGE'],
            countries: ['Armenia'],
          }),
        }),
      });
      expect(service.hasActiveWizard(CHAT_ID)).toBe(false);
    });

    it('should reject submit if agency name already exists', async () => {
      prisma.agency.findUnique.mockResolvedValue({ id: 'existing-agency' });

      const result = await service.handleCallback(CHAT_ID, 'agency:submit');
      expect(result.text).toContain('already exists');
    });

    it('should handle DB error gracefully', async () => {
      prisma.agency.findUnique.mockResolvedValue(null);
      prisma.agencyApplication.create.mockRejectedValue(
        new Error('DB connection lost'),
      );

      const result = await service.handleCallback(CHAT_ID, 'agency:submit');
      expect(result.text).toContain('Failed to submit');
    });
  });

  // -------------------------------------------------------------------------
  // Cancel
  // -------------------------------------------------------------------------

  describe('handleCallback — cancel', () => {
    it('should cancel active wizard', async () => {
      prisma.agency.findFirst.mockResolvedValue(null);
      prisma.agencyApplication.findFirst.mockResolvedValue(null);
      await service.startOrResume(CHAT_ID, USER_ID);
      expect(service.hasActiveWizard(CHAT_ID)).toBe(true);

      const result = await service.handleCallback(CHAT_ID, 'agency:cancel');
      expect(result.text).toContain('cancelled');
      expect(service.hasActiveWizard(CHAT_ID)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Review flow
  // -------------------------------------------------------------------------

  describe('findPendingApplications', () => {
    it('should return submitted applications', async () => {
      prisma.agencyApplication.findMany.mockResolvedValue([
        { id: 'app-001', draftData: { name: 'Agency A' }, createdAt: new Date() },
      ]);

      const apps = await service.findPendingApplications();
      expect(apps).toHaveLength(1);
      expect(prisma.agencyApplication.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: AgencyApplicationStatus.SUBMITTED },
        }),
      );
    });
  });

  describe('approveApplication', () => {
    it('should create agency and update application in transaction', async () => {
      const appData = {
        id: 'app-001',
        applicantUserId: USER_ID,
        draftData: {
          name: 'New Agency',
          phone: '+37491000000',
          specializations: ['PACKAGE'],
          countries: ['Armenia'],
          chatId: CHAT_ID,
        },
      };

      prisma.agencyApplication.findUniqueOrThrow.mockResolvedValue(appData);

      const mockTx = {
        agency: { create: jest.fn().mockResolvedValue({ id: 'agency-new' }) },
        user: { findUnique: jest.fn().mockResolvedValue({ id: USER_ID, telegramId: BigInt(111222333) }) },
        agencyMembership: { create: jest.fn().mockResolvedValue({}) },
        agencyApplication: { update: jest.fn().mockResolvedValue({}) },
      };

      prisma.$transaction.mockImplementation(async (fn: any) => fn(mockTx));

      const result = await service.approveApplication('app-001', 'reviewer-001');

      expect(result.agencyId).toBe('agency-new');
      expect(result.applicantTelegramId).toBe(BigInt(111222333));
      expect(mockTx.agency.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'New Agency',
          status: AgencyStatus.APPROVED,
        }),
      });
      expect(mockTx.agencyApplication.update).toHaveBeenCalledWith({
        where: { id: 'app-001' },
        data: expect.objectContaining({
          status: AgencyApplicationStatus.APPROVED,
          reviewerUserId: 'reviewer-001',
        }),
      });
    });
  });

  describe('rejectApplication', () => {
    it('should update application with rejection reason', async () => {
      prisma.agencyApplication.update.mockResolvedValue({
        applicantUserId: USER_ID,
      });

      const result = await service.rejectApplication(
        'app-001',
        'reviewer-001',
        'Incomplete info',
      );

      expect(result.applicantUserId).toBe(USER_ID);
      expect(prisma.agencyApplication.update).toHaveBeenCalledWith({
        where: { id: 'app-001' },
        data: expect.objectContaining({
          status: AgencyApplicationStatus.REJECTED,
          decisionReason: 'Incomplete info',
          reviewerUserId: 'reviewer-001',
        }),
      });
    });
  });

  describe('rejection reason flow', () => {
    it('should collect reason text and reject application', async () => {
      prisma.agencyApplication.update.mockResolvedValue({
        applicantUserId: USER_ID,
      });

      // Set pending reason
      service.setPendingRejectReason(CHAT_ID, 'app-001', 'reviewer-001');
      expect(service.hasPendingRejectReason(CHAT_ID)).toBe(true);

      // Provide reason text
      const result = await service.handleTextInput(CHAT_ID, 'Bad documents');
      expect(result.text).toContain('rejected');
      expect(prisma.agencyApplication.update).toHaveBeenCalled();
      expect(service.hasPendingRejectReason(CHAT_ID)).toBe(false);
    });

    it('should reject empty reason', async () => {
      service.setPendingRejectReason(CHAT_ID, 'app-001', 'reviewer-001');

      const result = await service.handleTextInput(CHAT_ID, '   ');
      expect(result.text).toContain('cannot be empty');
    });
  });
});

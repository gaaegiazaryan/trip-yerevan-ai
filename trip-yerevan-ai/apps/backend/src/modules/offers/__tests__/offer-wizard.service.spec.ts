import { OfferWizardService } from '../offer-wizard.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { OfferWizardStep, isOfferSubmitResult } from '../offer-wizard.types';
import { AgentRole, AgentStatus, OfferStatus, RfqDeliveryStatus } from '@prisma/client';

function createMockPrisma() {
  return {
    user: {
      findUnique: jest.fn(),
    },
    agency: {
      findFirst: jest.fn(),
    },
    agencyAgent: {
      create: jest.fn(),
    },
    offer: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    travelRequest: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    rfqDistribution: {
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
}

describe('OfferWizardService', () => {
  let service: OfferWizardService;
  let prisma: ReturnType<typeof createMockPrisma>;

  const CHAT_ID = 123456789;
  const TELEGRAM_ID = BigInt(111222333);
  const TRAVEL_REQUEST_ID = 'req-001';
  const AGENCY_ID = 'agency-001';
  const AGENT_ID = 'agent-001';

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new OfferWizardService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    service.cancelWizard(CHAT_ID);
  });

  // -------------------------------------------------------------------------
  // Start wizard + agent resolution
  // -------------------------------------------------------------------------

  describe('startWizard', () => {
    it('should start wizard when agent is resolved via AgencyAgent record', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-001',
        telegramId: TELEGRAM_ID,
        agencyAgent: { id: AGENT_ID, agencyId: AGENCY_ID },
      });
      prisma.offer.findUnique.mockResolvedValue(null);
      prisma.travelRequest.findUnique.mockResolvedValue({
        id: TRAVEL_REQUEST_ID,
        destination: 'Dubai',
      });

      const result = await service.startWizard(
        CHAT_ID,
        TRAVEL_REQUEST_ID,
        TELEGRAM_ID,
      );

      expect(result.text).toContain('Submit Offer');
      expect(result.text).toContain('Dubai');
      expect(result.text).toContain('total price');
      expect(service.hasActiveWizard(CHAT_ID)).toBe(true);
    });

    it('should auto-create AgencyAgent when chat matches agency telegramChatId', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-001',
        telegramId: TELEGRAM_ID,
        agencyAgent: null,
      });
      prisma.agency.findFirst.mockResolvedValue({
        id: AGENCY_ID,
        telegramChatId: BigInt(CHAT_ID),
      });
      prisma.agencyAgent.create.mockResolvedValue({
        id: AGENT_ID,
        agencyId: AGENCY_ID,
      });
      prisma.offer.findUnique.mockResolvedValue(null);
      prisma.travelRequest.findUnique.mockResolvedValue({
        id: TRAVEL_REQUEST_ID,
        destination: 'Dubai',
      });

      const result = await service.startWizard(
        CHAT_ID,
        TRAVEL_REQUEST_ID,
        TELEGRAM_ID,
      );

      expect(prisma.agencyAgent.create).toHaveBeenCalledWith({
        data: {
          agencyId: AGENCY_ID,
          userId: 'user-001',
          role: AgentRole.OWNER,
          status: AgentStatus.ACTIVE,
        },
      });
      expect(result.text).toContain('total price');
    });

    it('should reject if user is not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.startWizard(
        CHAT_ID,
        TRAVEL_REQUEST_ID,
        TELEGRAM_ID,
      );

      expect(result.text).toContain('not authorized');
      expect(service.hasActiveWizard(CHAT_ID)).toBe(false);
    });

    it('should reject if user has no AgencyAgent and chat does not match any agency', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-001',
        telegramId: TELEGRAM_ID,
        agencyAgent: null,
      });
      prisma.agency.findFirst.mockResolvedValue(null);

      const result = await service.startWizard(
        CHAT_ID,
        TRAVEL_REQUEST_ID,
        TELEGRAM_ID,
      );

      expect(result.text).toContain('not authorized');
    });

    it('should block duplicate offer (idempotency)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-001',
        telegramId: TELEGRAM_ID,
        agencyAgent: { id: AGENT_ID, agencyId: AGENCY_ID },
      });
      prisma.offer.findUnique.mockResolvedValue({
        id: 'existing-offer-001',
        travelRequestId: TRAVEL_REQUEST_ID,
        agencyId: AGENCY_ID,
      });

      const result = await service.startWizard(
        CHAT_ID,
        TRAVEL_REQUEST_ID,
        TELEGRAM_ID,
      );

      expect(result.text).toContain('already been submitted');
      expect(service.hasActiveWizard(CHAT_ID)).toBe(false);
    });

    it('should reject if travel request not found', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-001',
        telegramId: TELEGRAM_ID,
        agencyAgent: { id: AGENT_ID, agencyId: AGENCY_ID },
      });
      prisma.offer.findUnique.mockResolvedValue(null);
      prisma.travelRequest.findUnique.mockResolvedValue(null);

      const result = await service.startWizard(
        CHAT_ID,
        TRAVEL_REQUEST_ID,
        TELEGRAM_ID,
      );

      expect(result.text).toContain('not found');
    });
  });

  // -------------------------------------------------------------------------
  // Price validation
  // -------------------------------------------------------------------------

  describe('handleTextInput — PRICE step', () => {
    beforeEach(async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-001',
        telegramId: TELEGRAM_ID,
        agencyAgent: { id: AGENT_ID, agencyId: AGENCY_ID },
      });
      prisma.offer.findUnique.mockResolvedValue(null);
      prisma.travelRequest.findUnique.mockResolvedValue({
        id: TRAVEL_REQUEST_ID,
        destination: 'Dubai',
      });
      await service.startWizard(CHAT_ID, TRAVEL_REQUEST_ID, TELEGRAM_ID);
    });

    it('should accept valid price and advance to CURRENCY step', async () => {
      const result = await service.handleTextInput(CHAT_ID, '1500');

      expect(result.text).toContain('1,500');
      expect(result.text).toContain('currency');
      expect(result.buttons).toHaveLength(4);
      expect(result.buttons![0].callbackData).toBe('offer:cur:AMD');
    });

    it('should accept price with commas', async () => {
      const result = await service.handleTextInput(CHAT_ID, '2,500');

      expect(result.text).toContain('2,500');
      expect(result.buttons).toHaveLength(4);
    });

    it('should reject zero price', async () => {
      const result = await service.handleTextInput(CHAT_ID, '0');

      expect(result.text).toContain('valid positive number');
    });

    it('should reject negative price', async () => {
      const result = await service.handleTextInput(CHAT_ID, '-100');

      expect(result.text).toContain('valid positive number');
    });

    it('should reject non-numeric input', async () => {
      const result = await service.handleTextInput(CHAT_ID, 'abc');

      expect(result.text).toContain('valid positive number');
    });

    it('should reject extremely large price', async () => {
      const result = await service.handleTextInput(CHAT_ID, '99999999999');

      expect(result.text).toContain('too large');
    });
  });

  // -------------------------------------------------------------------------
  // Currency selection
  // -------------------------------------------------------------------------

  describe('handleCallback — CURRENCY step', () => {
    beforeEach(async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-001',
        telegramId: TELEGRAM_ID,
        agencyAgent: { id: AGENT_ID, agencyId: AGENCY_ID },
      });
      prisma.offer.findUnique.mockResolvedValue(null);
      prisma.travelRequest.findUnique.mockResolvedValue({
        id: TRAVEL_REQUEST_ID,
        destination: 'Dubai',
      });
      await service.startWizard(CHAT_ID, TRAVEL_REQUEST_ID, TELEGRAM_ID);
      await service.handleTextInput(CHAT_ID, '1500');
    });

    it('should accept valid currency and advance to VALID_UNTIL', async () => {
      const result = await service.handleCallback(CHAT_ID, 'offer:cur:USD');

      expect(result.text).toContain('valid');
      expect(result.buttons).toHaveLength(3);
      expect(result.buttons![0].callbackData).toBe('offer:ttl:1d');
    });

    it('should accept all allowed currencies', async () => {
      for (const currency of ['AMD', 'RUB', 'USD', 'EUR']) {
        // Reset wizard state to CURRENCY step each time
        service.cancelWizard(CHAT_ID);
        prisma.offer.findUnique.mockResolvedValue(null);
        prisma.travelRequest.findUnique.mockResolvedValue({
          id: TRAVEL_REQUEST_ID,
          destination: 'Dubai',
        });
        await service.startWizard(CHAT_ID, TRAVEL_REQUEST_ID, TELEGRAM_ID);
        await service.handleTextInput(CHAT_ID, '1500');

        const result = await service.handleCallback(
          CHAT_ID,
          `offer:cur:${currency}`,
        );
        expect(result.text).toContain('valid');
      }
    });

    it('should reject invalid currency', async () => {
      const result = await service.handleCallback(CHAT_ID, 'offer:cur:GBP');

      expect(result.text).toContain('Invalid currency');
    });
  });

  // -------------------------------------------------------------------------
  // Validity period
  // -------------------------------------------------------------------------

  describe('handleCallback — VALID_UNTIL step', () => {
    beforeEach(async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-001',
        telegramId: TELEGRAM_ID,
        agencyAgent: { id: AGENT_ID, agencyId: AGENCY_ID },
      });
      prisma.offer.findUnique.mockResolvedValue(null);
      prisma.travelRequest.findUnique.mockResolvedValue({
        id: TRAVEL_REQUEST_ID,
        destination: 'Dubai',
      });
      await service.startWizard(CHAT_ID, TRAVEL_REQUEST_ID, TELEGRAM_ID);
      await service.handleTextInput(CHAT_ID, '1500');
      await service.handleCallback(CHAT_ID, 'offer:cur:USD');
    });

    it('should accept 3-day validity and advance to NOTE', async () => {
      const result = await service.handleCallback(CHAT_ID, 'offer:ttl:3d');

      expect(result.text).toContain('description');
    });

    it('should accept custom future date via text', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);
      const dateStr = futureDate.toISOString().split('T')[0];

      const result = await service.handleTextInput(CHAT_ID, dateStr);

      expect(result.text).toContain('description');
    });

    it('should reject past date', async () => {
      const result = await service.handleTextInput(CHAT_ID, '2020-01-01');

      expect(result.text).toContain('future');
    });

    it('should reject invalid date format', async () => {
      const result = await service.handleTextInput(CHAT_ID, 'not-a-date');

      expect(result.text).toContain('Invalid date');
    });
  });

  // -------------------------------------------------------------------------
  // Note
  // -------------------------------------------------------------------------

  describe('handleTextInput — NOTE step', () => {
    beforeEach(async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-001',
        telegramId: TELEGRAM_ID,
        agencyAgent: { id: AGENT_ID, agencyId: AGENCY_ID },
      });
      prisma.offer.findUnique.mockResolvedValue(null);
      prisma.travelRequest.findUnique.mockResolvedValue({
        id: TRAVEL_REQUEST_ID,
        destination: 'Dubai',
      });
      await service.startWizard(CHAT_ID, TRAVEL_REQUEST_ID, TELEGRAM_ID);
      await service.handleTextInput(CHAT_ID, '1500');
      await service.handleCallback(CHAT_ID, 'offer:cur:USD');
      await service.handleCallback(CHAT_ID, 'offer:ttl:3d');
    });

    it('should accept valid note and show confirmation', async () => {
      const result = await service.handleTextInput(
        CHAT_ID,
        'All inclusive package with airport transfers',
      );

      expect(result.text).toContain('Review your offer');
      expect(result.text).toContain('1,500 USD');
      expect(result.text).toContain('All inclusive');
      expect(result.buttons).toHaveLength(2);
      expect(result.buttons![0].callbackData).toBe('offer:submit');
      expect(result.buttons![1].callbackData).toBe('offer:cancel');
    });

    it('should reject note exceeding 500 chars', async () => {
      const longNote = 'A'.repeat(501);
      const result = await service.handleTextInput(CHAT_ID, longNote);

      expect(result.text).toContain('too long');
      expect(result.text).toContain('501/500');
    });
  });

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  describe('handleCallback — offer:submit', () => {
    beforeEach(async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-001',
        telegramId: TELEGRAM_ID,
        agencyAgent: { id: AGENT_ID, agencyId: AGENCY_ID },
      });
      prisma.offer.findUnique.mockResolvedValue(null);
      prisma.travelRequest.findUnique.mockResolvedValue({
        id: TRAVEL_REQUEST_ID,
        destination: 'Dubai',
      });
      await service.startWizard(CHAT_ID, TRAVEL_REQUEST_ID, TELEGRAM_ID);
      await service.handleTextInput(CHAT_ID, '1500');
      await service.handleCallback(CHAT_ID, 'offer:cur:USD');
      await service.handleCallback(CHAT_ID, 'offer:ttl:3d');
      await service.handleTextInput(CHAT_ID, 'All inclusive package');
    });

    it('should create offer and update distribution status', async () => {
      const mockOffer = {
        id: 'offer-001',
        travelRequestId: TRAVEL_REQUEST_ID,
        agencyId: AGENCY_ID,
        status: OfferStatus.SUBMITTED,
      };
      const travelerTelegramId = BigInt(999888777);

      prisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          offer: {
            create: jest.fn().mockResolvedValue(mockOffer),
          },
          rfqDistribution: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
          travelRequest: {
            findUniqueOrThrow: jest.fn().mockResolvedValue({
              id: TRAVEL_REQUEST_ID,
              user: { telegramId: travelerTelegramId },
            }),
          },
        };
        return fn(tx);
      });

      // Need to mock offer.findUnique again for the pre-submit idempotency check
      prisma.offer.findUnique.mockResolvedValue(null);

      const result = await service.handleCallback(CHAT_ID, 'offer:submit');

      expect(isOfferSubmitResult(result)).toBe(true);
      if (isOfferSubmitResult(result)) {
        expect(result.offerId).toBe('offer-001');
        expect(result.travelerTelegramId).toBe(travelerTelegramId);
        expect(result.travelRequestId).toBe(TRAVEL_REQUEST_ID);
      }
      expect(result.text).toContain('submitted successfully');
      expect(service.hasActiveWizard(CHAT_ID)).toBe(false);
    });

    it('should handle DB error gracefully', async () => {
      prisma.offer.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockRejectedValue(new Error('DB connection lost'));

      const result = await service.handleCallback(CHAT_ID, 'offer:submit');

      expect(result.text).toContain('Failed to submit');
    });
  });

  // -------------------------------------------------------------------------
  // Cancel
  // -------------------------------------------------------------------------

  describe('handleCallback — offer:cancel', () => {
    it('should clear wizard state', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-001',
        telegramId: TELEGRAM_ID,
        agencyAgent: { id: AGENT_ID, agencyId: AGENCY_ID },
      });
      prisma.offer.findUnique.mockResolvedValue(null);
      prisma.travelRequest.findUnique.mockResolvedValue({
        id: TRAVEL_REQUEST_ID,
        destination: 'Dubai',
      });
      await service.startWizard(CHAT_ID, TRAVEL_REQUEST_ID, TELEGRAM_ID);
      expect(service.hasActiveWizard(CHAT_ID)).toBe(true);

      const result = await service.handleCallback(CHAT_ID, 'offer:cancel');

      expect(result.text).toContain('cancelled');
      expect(service.hasActiveWizard(CHAT_ID)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases
  // -------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should return error when no active wizard for text input', async () => {
      const result = await service.handleTextInput(CHAT_ID, 'hello');

      expect(result.text).toContain('No active');
    });

    it('should return error when no active wizard for callback', async () => {
      const result = await service.handleCallback(CHAT_ID, 'offer:cur:USD');

      expect(result.text).toContain('No active');
    });
  });
});

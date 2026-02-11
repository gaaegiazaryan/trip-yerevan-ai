import { BookingAcceptanceService } from '../booking-acceptance.service';
import {
  BookingStatus,
  OfferStatus,
  TravelRequestStatus,
} from '@prisma/client';

function createMockPrisma() {
  return {
    offer: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    travelRequest: { update: jest.fn() },
    booking: { create: jest.fn() },
    $transaction: jest.fn(),
  };
}

function createMockConfig() {
  return {
    get: jest.fn().mockReturnValue(undefined),
  };
}

function createMockStateMachine() {
  return {
    transition: jest.fn().mockResolvedValue({
      success: true,
      notifications: [],
      booking: { id: 'booking-transitioned' },
    }),
  };
}

const OWNER_USER_ID = 'user-owner-001';
const OTHER_USER_ID = 'user-other-002';
const OFFER_ID = 'offer-001';
const AGENCY_ID = 'agency-001';
const TR_ID = 'tr-001';
const AGENT_TELEGRAM_ID = BigInt(99999);

function makeOffer(overrides: Record<string, unknown> = {}) {
  return {
    id: OFFER_ID,
    travelRequestId: TR_ID,
    agencyId: AGENCY_ID,
    totalPrice: 1500,
    currency: 'USD',
    status: OfferStatus.SUBMITTED,
    travelRequest: {
      id: TR_ID,
      userId: OWNER_USER_ID,
      status: TravelRequestStatus.OFFERS_RECEIVED,
      destination: 'Dubai',
    },
    agency: {
      id: AGENCY_ID,
      name: 'TravelCo',
      agencyTelegramChatId: null,
    },
    membership: {
      user: { telegramId: AGENT_TELEGRAM_ID },
    },
    ...overrides,
  };
}

describe('BookingAcceptanceService', () => {
  let service: BookingAcceptanceService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let config: ReturnType<typeof createMockConfig>;
  let stateMachine: ReturnType<typeof createMockStateMachine>;

  beforeEach(() => {
    prisma = createMockPrisma();
    config = createMockConfig();
    stateMachine = createMockStateMachine();
    service = new BookingAcceptanceService(prisma as any, config as any, stateMachine as any);
  });

  describe('showConfirmation', () => {
    it('should return confirmation prompt with buttons', async () => {
      prisma.offer.findUnique.mockResolvedValue(makeOffer());

      const result = await service.showConfirmation(OFFER_ID, OWNER_USER_ID);

      expect(result.text).toContain('Are you sure');
      expect(result.text).toContain('TravelCo');
      expect(result.text).toContain('1,500 USD');
      expect(result.buttons).toHaveLength(2);
      expect(result.buttons![0].callbackData).toBe(`offers:cfm:${OFFER_ID}`);
      expect(result.buttons![1].callbackData).toBe('offers:cxl');
    });

    it('should return error when offer not found', async () => {
      prisma.offer.findUnique.mockResolvedValue(null);

      const result = await service.showConfirmation('bad-id', OWNER_USER_ID);

      expect(result.text).toContain('not found');
      expect(result.buttons).toBeUndefined();
    });

    it('should reject unauthorized user', async () => {
      prisma.offer.findUnique.mockResolvedValue(makeOffer());

      const result = await service.showConfirmation(OFFER_ID, OTHER_USER_ID);

      expect(result.text).toContain('not authorized');
    });

    it('should return error when offer already accepted', async () => {
      prisma.offer.findUnique.mockResolvedValue(
        makeOffer({ status: OfferStatus.ACCEPTED }),
      );

      const result = await service.showConfirmation(OFFER_ID, OWNER_USER_ID);

      expect(result.text).toContain('already been accepted');
    });

    it('should return error when offer is withdrawn', async () => {
      prisma.offer.findUnique.mockResolvedValue(
        makeOffer({ status: OfferStatus.WITHDRAWN }),
      );

      const result = await service.showConfirmation(OFFER_ID, OWNER_USER_ID);

      expect(result.text).toContain('no longer available');
    });

    it('should return error when TR already booked', async () => {
      prisma.offer.findUnique.mockResolvedValue(
        makeOffer({
          travelRequest: {
            id: TR_ID,
            userId: OWNER_USER_ID,
            status: TravelRequestStatus.BOOKED,
            destination: 'Dubai',
          },
        }),
      );

      const result = await service.showConfirmation(OFFER_ID, OWNER_USER_ID);

      expect(result.text).toContain('already exists');
    });
  });

  describe('confirmAcceptance', () => {
    it('should create booking and return notifications', async () => {
      prisma.offer.findUnique.mockResolvedValue(makeOffer());
      prisma.$transaction.mockImplementation(async (fn: any) => {
        return fn({
          booking: { create: jest.fn().mockResolvedValue({ id: 'booking-001' }) },
          offer: { update: jest.fn(), updateMany: jest.fn() },
          travelRequest: { update: jest.fn() },
        });
      });

      const result = await service.confirmAcceptance(OFFER_ID, OWNER_USER_ID);

      expect(result.text).toContain('Booking Created');
      expect(result.text).toContain('TravelCo');
      expect(result.text).toContain('Dubai');
      expect(result.travelRequestId).toBe(TR_ID);

      // Agent notification
      expect(result.notifications).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            chatId: Number(AGENT_TELEGRAM_ID),
            text: expect.stringContaining('Offer Accepted'),
          }),
        ]),
      );
    });

    it('should include agency group chat notification when set', async () => {
      const GROUP_CHAT_ID = BigInt(88888);
      prisma.offer.findUnique.mockResolvedValue(
        makeOffer({
          agency: {
            id: AGENCY_ID,
            name: 'TravelCo',
            agencyTelegramChatId: GROUP_CHAT_ID,
          },
        }),
      );
      prisma.$transaction.mockImplementation(async (fn: any) => {
        return fn({
          booking: { create: jest.fn().mockResolvedValue({ id: 'booking-002' }) },
          offer: { update: jest.fn(), updateMany: jest.fn() },
          travelRequest: { update: jest.fn() },
        });
      });

      const result = await service.confirmAcceptance(OFFER_ID, OWNER_USER_ID);

      // Should have agent personal + agency group
      const chatIds = result.notifications.map((n) => n.chatId);
      expect(chatIds).toContain(Number(AGENT_TELEGRAM_ID));
      expect(chatIds).toContain(Number(GROUP_CHAT_ID));
    });

    it('should include manager channel notification when ENV is set', async () => {
      config.get.mockReturnValue('77777');
      // Recreate service with manager channel configured
      service = new BookingAcceptanceService(prisma as any, config as any, stateMachine as any);

      prisma.offer.findUnique.mockResolvedValue(makeOffer());
      prisma.$transaction.mockImplementation(async (fn: any) => {
        return fn({
          booking: { create: jest.fn().mockResolvedValue({ id: 'booking-003' }) },
          offer: { update: jest.fn(), updateMany: jest.fn() },
          travelRequest: { update: jest.fn() },
        });
      });

      const result = await service.confirmAcceptance(OFFER_ID, OWNER_USER_ID);

      const managerNotif = result.notifications.find((n) => n.chatId === 77777);
      expect(managerNotif).toBeDefined();
      expect(managerNotif!.text).toContain('New Booking');
    });

    it('should return error when offer not found', async () => {
      prisma.offer.findUnique.mockResolvedValue(null);

      const result = await service.confirmAcceptance('bad-id', OWNER_USER_ID);

      expect(result.text).toContain('not found');
      expect(result.notifications).toHaveLength(0);
    });

    it('should reject unauthorized user', async () => {
      prisma.offer.findUnique.mockResolvedValue(makeOffer());

      const result = await service.confirmAcceptance(OFFER_ID, OTHER_USER_ID);

      expect(result.text).toContain('not authorized');
    });

    it('should return error when TR already booked', async () => {
      prisma.offer.findUnique.mockResolvedValue(
        makeOffer({
          travelRequest: {
            id: TR_ID,
            userId: OWNER_USER_ID,
            status: TravelRequestStatus.BOOKED,
            destination: 'Dubai',
          },
        }),
      );

      const result = await service.confirmAcceptance(OFFER_ID, OWNER_USER_ID);

      expect(result.text).toContain('already exists');
    });

    it('should handle double-accept race (P2002 unique constraint)', async () => {
      prisma.offer.findUnique.mockResolvedValue(makeOffer());

      const uniqueError = new Error('Unique constraint failed') as any;
      uniqueError.code = 'P2002';
      prisma.$transaction.mockRejectedValue(uniqueError);

      const result = await service.confirmAcceptance(OFFER_ID, OWNER_USER_ID);

      expect(result.text).toContain('already been accepted');
      expect(result.notifications).toHaveLength(0);
    });

    it('should re-throw non-P2002 errors', async () => {
      prisma.offer.findUnique.mockResolvedValue(makeOffer());
      prisma.$transaction.mockRejectedValue(new Error('DB connection lost'));

      await expect(
        service.confirmAcceptance(OFFER_ID, OWNER_USER_ID),
      ).rejects.toThrow('DB connection lost');
    });

    it('should execute correct operations in transaction', async () => {
      prisma.offer.findUnique.mockResolvedValue(makeOffer());

      const txMocks = {
        booking: { create: jest.fn().mockResolvedValue({ id: 'booking-004' }) },
        offer: { update: jest.fn(), updateMany: jest.fn() },
        travelRequest: { update: jest.fn() },
      };
      prisma.$transaction.mockImplementation(async (fn: any) => fn(txMocks));

      await service.confirmAcceptance(OFFER_ID, OWNER_USER_ID);

      // 1. Booking created
      expect(txMocks.booking.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            offerId: OFFER_ID,
            userId: OWNER_USER_ID,
            status: BookingStatus.CREATED,
          }),
        }),
      );

      // 2. Offer → ACCEPTED
      expect(txMocks.offer.update).toHaveBeenCalledWith({
        where: { id: OFFER_ID },
        data: { status: OfferStatus.ACCEPTED },
      });

      // 3. TR → BOOKED
      expect(txMocks.travelRequest.update).toHaveBeenCalledWith({
        where: { id: TR_ID },
        data: { status: TravelRequestStatus.BOOKED },
      });

      // 4. Other offers withdrawn
      expect(txMocks.offer.updateMany).toHaveBeenCalledWith({
        where: {
          travelRequestId: TR_ID,
          id: { not: OFFER_ID },
          status: { in: [OfferStatus.SUBMITTED, OfferStatus.VIEWED] },
        },
        data: { status: OfferStatus.WITHDRAWN },
      });
    });

    it('should skip manager notification when ENV not set', async () => {
      // config.get returns undefined (default)
      prisma.offer.findUnique.mockResolvedValue(makeOffer());
      prisma.$transaction.mockImplementation(async (fn: any) => {
        return fn({
          booking: { create: jest.fn().mockResolvedValue({ id: 'booking-005' }) },
          offer: { update: jest.fn(), updateMany: jest.fn() },
          travelRequest: { update: jest.fn() },
        });
      });

      const result = await service.confirmAcceptance(OFFER_ID, OWNER_USER_ID);

      // Only agent notification (no manager)
      expect(result.notifications).toHaveLength(1);
      expect(result.notifications[0].chatId).toBe(Number(AGENT_TELEGRAM_ID));
    });
  });
});

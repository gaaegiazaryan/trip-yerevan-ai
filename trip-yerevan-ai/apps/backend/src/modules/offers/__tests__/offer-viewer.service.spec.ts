import { OfferViewerService, OfferListResult, OfferDetailResult } from '../offer-viewer.service';
import { OfferStatus } from '@prisma/client';
import { OFFERS_PAGE_SIZE } from '../offer-formatter';

function createMockPrisma() {
  return {
    travelRequest: {
      findUnique: jest.fn(),
    },
    offer: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
}

const OWNER_USER_ID = 'user-owner-001';
const OTHER_USER_ID = 'user-other-002';
const TRAVEL_REQUEST_ID = 'tr-001';
const OFFER_ID_1 = 'offer-001';
const OFFER_ID_2 = 'offer-002';

function makeOffer(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    travelRequestId: TRAVEL_REQUEST_ID,
    agencyId: 'agency-001',
    agency: { name: 'TravelCo' },
    totalPrice: 1500,
    currency: 'USD',
    status: OfferStatus.SUBMITTED,
    validUntil: new Date('2026-03-15'),
    priceIncludes: [],
    priceExcludes: [],
    hotelName: null,
    hotelStars: null,
    roomType: null,
    mealPlan: null,
    hotelLocation: null,
    hotelDescription: null,
    airline: null,
    departureFlightNumber: null,
    returnFlightNumber: null,
    baggageIncluded: null,
    flightClass: null,
    transferIncluded: null,
    transferType: null,
    departureDate: null,
    returnDate: null,
    nightsCount: null,
    adults: null,
    children: null,
    insuranceIncluded: null,
    attachments: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeTravelRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: TRAVEL_REQUEST_ID,
    userId: OWNER_USER_ID,
    destination: 'Dubai',
    departureDate: null,
    returnDate: null,
    adults: null,
    children: null,
    ...overrides,
  };
}

describe('OfferViewerService', () => {
  let service: OfferViewerService;
  let prisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    prisma = createMockPrisma();
    service = new OfferViewerService(prisma as any);
  });

  // =========================================================================
  // getOfferList
  // =========================================================================

  describe('getOfferList', () => {
    it('should return paginated offers with Close button', async () => {
      prisma.travelRequest.findUnique.mockResolvedValue(makeTravelRequest());

      prisma.offer.findMany.mockResolvedValue([
        makeOffer(OFFER_ID_1, { totalPrice: 1000, agency: { name: 'CheapTravel' } }),
        makeOffer(OFFER_ID_2, { totalPrice: 2000, agency: { name: 'LuxTravel' } }),
      ]);

      const result = await service.getOfferList(TRAVEL_REQUEST_ID, OWNER_USER_ID);

      expect(result.buttons).toBeDefined();
      const r = result as OfferListResult;
      expect(r.totalOffers).toBe(2);
      expect(r.page).toBe(0);
      expect(r.totalPages).toBe(1);
      expect(r.travelRequestId).toBe(TRAVEL_REQUEST_ID);
      expect(r.text).toContain('Dubai');
      expect(r.text).toContain('2 offers received');
      // 2 offer buttons + Close
      expect(r.buttons.length).toBe(3);
      expect(r.buttons[2].callbackData).toBe('offers:close');
    });

    it('should return empty state when no offers exist', async () => {
      prisma.travelRequest.findUnique.mockResolvedValue(makeTravelRequest());

      prisma.offer.findMany.mockResolvedValue([]);

      const result = await service.getOfferList(TRAVEL_REQUEST_ID, OWNER_USER_ID);

      expect(result.buttons).toBeUndefined();
      expect(result.text).toContain('No offers yet');
    });

    it('should reject unauthorized user', async () => {
      prisma.travelRequest.findUnique.mockResolvedValue(makeTravelRequest());

      const result = await service.getOfferList(TRAVEL_REQUEST_ID, OTHER_USER_ID);

      expect(result.buttons).toBeUndefined();
      expect(result.text).toContain('not authorized');
      expect(prisma.offer.findMany).not.toHaveBeenCalled();
    });

    it('should return error when travel request not found', async () => {
      prisma.travelRequest.findUnique.mockResolvedValue(null);

      const result = await service.getOfferList('nonexistent', OWNER_USER_ID);

      expect(result.text).toContain('Travel request not found');
    });

    it('should order by createdAt desc', async () => {
      prisma.travelRequest.findUnique.mockResolvedValue(makeTravelRequest());
      prisma.offer.findMany.mockResolvedValue([]);

      await service.getOfferList(TRAVEL_REQUEST_ID, OWNER_USER_ID);

      expect(prisma.offer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should paginate correctly with PAGE_SIZE=5', async () => {
      prisma.travelRequest.findUnique.mockResolvedValue(
        makeTravelRequest({ destination: null }),
      );

      const offers = Array.from({ length: 12 }, (_, i) =>
        makeOffer(`offer-${i}`, {
          totalPrice: 1000 + i * 100,
          agency: { name: `Agency${i}` },
        }),
      );
      prisma.offer.findMany.mockResolvedValue(offers);

      // Page 0: 5 offers + Next + Close
      const page0 = (await service.getOfferList(
        TRAVEL_REQUEST_ID,
        OWNER_USER_ID,
        0,
      )) as OfferListResult;
      expect(page0.totalOffers).toBe(12);
      expect(page0.totalPages).toBe(3);
      expect(page0.page).toBe(0);
      const offerButtons0 = page0.buttons.filter((b) =>
        b.callbackData.startsWith('offers:d:'),
      );
      expect(offerButtons0).toHaveLength(5);
      expect(page0.buttons.find((b) => b.label.includes('Next'))).toBeDefined();
      expect(
        page0.buttons.find((b) => b.label.includes('Previous')),
      ).toBeUndefined();
      expect(page0.buttons.find((b) => b.callbackData === 'offers:close')).toBeDefined();

      // Page 1: 5 offers + Prev + Next + Close
      const page1 = (await service.getOfferList(
        TRAVEL_REQUEST_ID,
        OWNER_USER_ID,
        1,
      )) as OfferListResult;
      expect(page1.page).toBe(1);
      const offerButtons1 = page1.buttons.filter((b) =>
        b.callbackData.startsWith('offers:d:'),
      );
      expect(offerButtons1).toHaveLength(5);
      expect(page1.buttons.find((b) => b.label.includes('Previous'))).toBeDefined();
      expect(page1.buttons.find((b) => b.label.includes('Next'))).toBeDefined();

      // Page 2: 2 offers + Prev + Close
      const page2 = (await service.getOfferList(
        TRAVEL_REQUEST_ID,
        OWNER_USER_ID,
        2,
      )) as OfferListResult;
      expect(page2.page).toBe(2);
      const offerButtons2 = page2.buttons.filter((b) =>
        b.callbackData.startsWith('offers:d:'),
      );
      expect(offerButtons2).toHaveLength(2);
      expect(page2.buttons.find((b) => b.label.includes('Previous'))).toBeDefined();
      expect(
        page2.buttons.find((b) => b.label.includes('Next')),
      ).toBeUndefined();
    });

    it('should clamp page to valid range', async () => {
      prisma.travelRequest.findUnique.mockResolvedValue(makeTravelRequest());

      prisma.offer.findMany.mockResolvedValue([
        makeOffer(OFFER_ID_1),
        makeOffer(OFFER_ID_2),
      ]);

      // Page 99 should clamp to page 0 (only 1 page of 2 offers)
      const result = (await service.getOfferList(
        TRAVEL_REQUEST_ID,
        OWNER_USER_ID,
        99,
      )) as OfferListResult;
      expect(result.page).toBe(0);

      // Negative page should clamp to 0
      const result2 = (await service.getOfferList(
        TRAVEL_REQUEST_ID,
        OWNER_USER_ID,
        -5,
      )) as OfferListResult;
      expect(result2.page).toBe(0);
    });

    it('should exclude DRAFT, REJECTED, WITHDRAWN, EXPIRED offers', async () => {
      prisma.travelRequest.findUnique.mockResolvedValue(makeTravelRequest());

      prisma.offer.findMany.mockResolvedValue([]);

      await service.getOfferList(TRAVEL_REQUEST_ID, OWNER_USER_ID);

      expect(prisma.offer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: {
              in: [OfferStatus.SUBMITTED, OfferStatus.VIEWED, OfferStatus.ACCEPTED],
            },
          }),
        }),
      );
    });

    it('should include detail button callbackData with offer ID', async () => {
      prisma.travelRequest.findUnique.mockResolvedValue(makeTravelRequest());

      prisma.offer.findMany.mockResolvedValue([makeOffer(OFFER_ID_1)]);

      const result = (await service.getOfferList(
        TRAVEL_REQUEST_ID,
        OWNER_USER_ID,
      )) as OfferListResult;

      expect(result.buttons[0].callbackData).toBe(`offers:d:${OFFER_ID_1}`);
    });

    it('should select TR header fields (dates, travelers)', async () => {
      prisma.travelRequest.findUnique.mockResolvedValue(
        makeTravelRequest({
          departureDate: new Date('2026-03-10'),
          returnDate: new Date('2026-03-17'),
          adults: 2,
          children: 1,
        }),
      );

      prisma.offer.findMany.mockResolvedValue([makeOffer(OFFER_ID_1)]);

      const result = (await service.getOfferList(
        TRAVEL_REQUEST_ID,
        OWNER_USER_ID,
      )) as OfferListResult;

      // Header should include dates and travelers
      expect(result.text).toContain('2026-03-10');
      expect(result.text).toContain('2 adults');
    });
  });

  // =========================================================================
  // getOfferDetail
  // =========================================================================

  describe('getOfferDetail', () => {
    it('should return full offer detail with agency name', async () => {
      prisma.offer.findUnique.mockResolvedValue(
        makeOffer(OFFER_ID_1, {
          travelRequest: { userId: OWNER_USER_ID, id: TRAVEL_REQUEST_ID },
          agency: { name: 'LuxTravel' },
          hotelName: 'Rixos Premium',
          totalPrice: 2020,
        }),
      );

      const result = await service.getOfferDetail(OFFER_ID_1, OWNER_USER_ID);

      expect(result.buttons).toBeDefined();
      const r = result as OfferDetailResult;
      expect(r.text).toContain('LuxTravel');
      expect(r.text).toContain('Rixos Premium');
      expect(r.text).toContain('2,020 USD');
      expect(r.travelRequestId).toBe(TRAVEL_REQUEST_ID);
    });

    it('should transition SUBMITTED -> VIEWED on first view', async () => {
      prisma.offer.findUnique.mockResolvedValue(
        makeOffer(OFFER_ID_1, {
          status: OfferStatus.SUBMITTED,
          travelRequest: { userId: OWNER_USER_ID, id: TRAVEL_REQUEST_ID },
        }),
      );

      await service.getOfferDetail(OFFER_ID_1, OWNER_USER_ID);

      expect(prisma.offer.update).toHaveBeenCalledWith({
        where: { id: OFFER_ID_1 },
        data: { status: OfferStatus.VIEWED },
      });
    });

    it('should NOT transition already VIEWED offer', async () => {
      prisma.offer.findUnique.mockResolvedValue(
        makeOffer(OFFER_ID_1, {
          status: OfferStatus.VIEWED,
          travelRequest: { userId: OWNER_USER_ID, id: TRAVEL_REQUEST_ID },
        }),
      );

      await service.getOfferDetail(OFFER_ID_1, OWNER_USER_ID);

      expect(prisma.offer.update).not.toHaveBeenCalled();
    });

    it('should NOT transition ACCEPTED offer', async () => {
      prisma.offer.findUnique.mockResolvedValue(
        makeOffer(OFFER_ID_1, {
          status: OfferStatus.ACCEPTED,
          travelRequest: { userId: OWNER_USER_ID, id: TRAVEL_REQUEST_ID },
        }),
      );

      await service.getOfferDetail(OFFER_ID_1, OWNER_USER_ID);

      expect(prisma.offer.update).not.toHaveBeenCalled();
    });

    it('should reject unauthorized user', async () => {
      prisma.offer.findUnique.mockResolvedValue(
        makeOffer(OFFER_ID_1, {
          travelRequest: { userId: OWNER_USER_ID, id: TRAVEL_REQUEST_ID },
        }),
      );

      const result = await service.getOfferDetail(OFFER_ID_1, OTHER_USER_ID);

      expect(result.buttons).toBeUndefined();
      expect(result.text).toContain('not authorized');
    });

    it('should return error when offer not found', async () => {
      prisma.offer.findUnique.mockResolvedValue(null);

      const result = await service.getOfferDetail('nonexistent', OWNER_USER_ID);

      expect(result.text).toContain('Offer not found');
    });

    it('should separate image and document attachments', async () => {
      prisma.offer.findUnique.mockResolvedValue(
        makeOffer(OFFER_ID_1, {
          travelRequest: { userId: OWNER_USER_ID, id: TRAVEL_REQUEST_ID },
          attachments: [
            { type: 'HOTEL_IMAGE', telegramFileId: 'img1', fileName: null },
            { type: 'HOTEL_IMAGE', telegramFileId: 'img2', fileName: null },
            { type: 'ITINERARY_PDF', telegramFileId: 'pdf1', fileName: 'trip.pdf' },
            { type: 'VOUCHER', telegramFileId: 'voucher1', fileName: 'hotel.pdf' },
          ],
        }),
      );

      const result = (await service.getOfferDetail(
        OFFER_ID_1,
        OWNER_USER_ID,
      )) as OfferDetailResult;

      expect(result.imageFileIds).toEqual(['img1', 'img2']);
      expect(result.documentFileIds).toEqual([
        { fileId: 'pdf1', fileName: 'trip.pdf' },
        { fileId: 'voucher1', fileName: 'hotel.pdf' },
      ]);
    });

    it('should include Back, Ask question, and Accept offer buttons', async () => {
      prisma.offer.findUnique.mockResolvedValue(
        makeOffer(OFFER_ID_1, {
          travelRequest: { userId: OWNER_USER_ID, id: TRAVEL_REQUEST_ID },
        }),
      );

      const result = (await service.getOfferDetail(
        OFFER_ID_1,
        OWNER_USER_ID,
      )) as OfferDetailResult;

      expect(result.buttons).toHaveLength(3);
      expect(result.buttons[0].callbackData).toBe(`offers:b:${TRAVEL_REQUEST_ID}`);
      expect(result.buttons[0].label).toContain('Back to offers');
      expect(result.buttons[1].callbackData).toBe(`offers:ask:${OFFER_ID_1}`);
      expect(result.buttons[1].label).toContain('Ask manager');
      expect(result.buttons[2].callbackData).toBe(`offers:accept:${OFFER_ID_1}`);
      expect(result.buttons[2].label).toContain('Accept offer');
    });
  });
});

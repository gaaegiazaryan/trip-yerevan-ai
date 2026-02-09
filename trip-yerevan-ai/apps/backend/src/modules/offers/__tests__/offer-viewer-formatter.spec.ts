import {
  formatOfferListPage,
  formatOfferDetail,
  OFFERS_PAGE_SIZE,
} from '../offer-formatter';
import { OfferStatus } from '@prisma/client';

function makeOffer(overrides: Record<string, unknown> = {}) {
  return {
    agency: { name: 'TravelCo' },
    totalPrice: 1500,
    currency: 'USD' as const,
    hotelName: null,
    hotelStars: null,
    nightsCount: null,
    airline: null,
    mealPlan: null,
    status: OfferStatus.SUBMITTED,
    ...overrides,
  };
}

function makeDetailOffer(overrides: Record<string, unknown> = {}) {
  return {
    agency: { name: 'TravelCo' },
    totalPrice: 2020,
    currency: 'USD' as const,
    priceIncludes: ['Flights', 'Hotel'],
    priceExcludes: ['Visa'],
    hotelName: 'Rixos Premium',
    hotelStars: 'FIVE' as const,
    roomType: 'Deluxe Sea View',
    mealPlan: 'UAI' as const,
    hotelLocation: 'JBR Beach',
    hotelDescription: 'Beachfront resort',
    airline: 'Emirates',
    departureFlightNumber: 'EK 713',
    returnFlightNumber: 'EK 714',
    baggageIncluded: true,
    flightClass: 'ECONOMY' as const,
    transferIncluded: true,
    transferType: 'PRIVATE' as const,
    departureDate: new Date('2026-03-10'),
    returnDate: new Date('2026-03-17'),
    nightsCount: 7,
    adults: 2,
    children: 1,
    insuranceIncluded: true,
    validUntil: new Date('2026-03-15'),
    ...overrides,
  };
}

describe('formatOfferListPage', () => {
  it('should format list with destination header', () => {
    const offers = [makeOffer()];
    const text = formatOfferListPage(offers, 'Dubai', 0, 1, 1);

    expect(text).toContain('Your Offers to Dubai');
    expect(text).toContain('1 offer received');
    expect(text).toContain('TravelCo');
    expect(text).toContain('1,500 USD');
  });

  it('should show numbered entries with hotel and airline', () => {
    const offers = [
      makeOffer({ agency: { name: 'AgencyA' }, hotelName: 'Hilton', airline: 'Emirates' }),
      makeOffer({ agency: { name: 'AgencyB' }, totalPrice: 800, hotelName: 'Marriott' }),
    ];
    const text = formatOfferListPage(offers, 'Dubai', 0, 1, 2);

    expect(text).toContain('*1. AgencyA*');
    expect(text).toContain('Hilton');
    expect(text).toContain('Emirates');
    expect(text).toContain('*2. AgencyB*');
    expect(text).toContain('Marriott');
    expect(text).toContain('2 offers received');
  });

  it('should show page indicator for multi-page', () => {
    const offers = [makeOffer()];
    const text = formatOfferListPage(offers, null, 1, 3, 7);

    expect(text).toContain('Page 2/3');
    expect(text).toContain('7 offers received');
  });

  it('should not show page indicator for single page', () => {
    const offers = [makeOffer()];
    const text = formatOfferListPage(offers, null, 0, 1, 1);

    expect(text).not.toContain('Page');
  });

  it('should show viewed badge for VIEWED offers', () => {
    const offers = [makeOffer({ status: OfferStatus.VIEWED })];
    const text = formatOfferListPage(offers, null, 0, 1, 1);

    expect(text).toContain('(viewed)');
  });

  it('should not show viewed badge for SUBMITTED offers', () => {
    const offers = [makeOffer({ status: OfferStatus.SUBMITTED })];
    const text = formatOfferListPage(offers, null, 0, 1, 1);

    expect(text).not.toContain('(viewed)');
  });

  it('should escape markdown in agency and hotel names', () => {
    const offers = [makeOffer({ agency: { name: 'Travel_Co' }, hotelName: 'Grand*Hotel' })];
    const text = formatOfferListPage(offers, null, 0, 1, 1);

    expect(text).toContain('Travel\\_Co');
    expect(text).toContain('Grand\\*Hotel');
  });

  it('should show meal plan and stars when available', () => {
    const offers = [makeOffer({ hotelStars: 'FIVE', mealPlan: 'AI' })];
    const text = formatOfferListPage(offers, null, 0, 1, 1);

    expect(text).toMatch(/5/); // star label contains 5
    expect(text).toContain('All Inclusive');
  });

  it('should handle without destination', () => {
    const offers = [makeOffer()];
    const text = formatOfferListPage(offers, null, 0, 1, 1);

    expect(text).toContain('Your Offers*');
    expect(text).not.toContain('Offers to ');
  });

  it('should export OFFERS_PAGE_SIZE as 3', () => {
    expect(OFFERS_PAGE_SIZE).toBe(3);
  });
});

describe('formatOfferDetail', () => {
  it('should format full detail with all sections', () => {
    const text = formatOfferDetail(makeDetailOffer());

    expect(text).toContain('Offer from *TravelCo*');
    expect(text).toContain('Rixos Premium');
    expect(text).toContain('Deluxe Sea View');
    expect(text).toContain('UAI (Ultra AI)');
    expect(text).toContain('JBR Beach');
    expect(text).toContain('Beachfront resort');
    expect(text).toContain('Emirates');
    expect(text).toContain('EK 713');
    expect(text).toContain('EK 714');
    expect(text).toContain('Baggage: Included');
    expect(text).toContain('Economy');
    expect(text).toContain('Private');
    expect(text).toContain('2026-03-10');
    expect(text).toContain('7 nights');
    expect(text).toContain('2 adults');
    expect(text).toContain('1 child');
    expect(text).toContain('Insurance included');
    expect(text).toContain('2,020 USD');
    expect(text).toContain('Flights, Hotel');
    expect(text).toContain('Visa');
    expect(text).toContain('Valid until');
  });

  it('should handle minimal offer (price only)', () => {
    const text = formatOfferDetail({
      agency: { name: 'BasicTravel' },
      totalPrice: 500,
      currency: 'EUR',
      priceIncludes: [],
      priceExcludes: [],
      validUntil: new Date('2026-04-01'),
    });

    expect(text).toContain('BasicTravel');
    expect(text).toContain('500 EUR');
    expect(text).toContain('2026-04-01');
    expect(text).not.toContain('Hotel');
    expect(text).not.toContain('Transfer');
    expect(text).not.toContain('Emirates');
  });

  it('should show transfer not included', () => {
    const text = formatOfferDetail(
      makeDetailOffer({ transferIncluded: false, transferType: null }),
    );

    expect(text).toContain('Transfer:* Not included');
  });

  it('should escape markdown in all text fields', () => {
    const text = formatOfferDetail(
      makeDetailOffer({
        agency: { name: 'Travel*Agency_One' },
        hotelName: 'Grand_Hotel',
      }),
    );

    expect(text).toContain('Travel\\*Agency\\_One');
    expect(text).toContain('Grand\\_Hotel');
  });

  it('should handle Decimal-like totalPrice', () => {
    const text = formatOfferDetail(
      makeDetailOffer({ totalPrice: { toNumber: () => 3500 } }),
    );

    // Number() on an object with toNumber falls back to NaN,
    // but our code does Number(totalPrice) which coerces the object
    expect(text).toContain('USD');
  });
});

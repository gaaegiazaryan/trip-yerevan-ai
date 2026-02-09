import {
  formatConfirmCard,
  formatTravelerNotification,
  formatSubmitSuccess,
} from '../offer-formatter';
import { OfferDraft, createEmptyDraft } from '../offer-wizard.types';

function fullDraft(): OfferDraft {
  return {
    totalPrice: 2020,
    currency: 'USD',
    includes: ['Flights', 'Hotel', 'Breakfast'],
    excludes: ['Excursions', 'Visa'],
    hotelName: 'Rixos Premium Dubai',
    hotelStars: 'FIVE',
    roomType: 'Deluxe Sea View',
    mealPlan: 'UAI',
    hotelLocation: 'JBR Beach',
    hotelDescription: 'Beachfront resort',
    airline: 'Emirates',
    departureFlightNumber: 'EK 713',
    returnFlightNumber: 'EK 714',
    baggageIncluded: true,
    flightClass: 'ECONOMY',
    transferIncluded: true,
    transferType: 'PRIVATE',
    departureDate: '2026-03-10',
    returnDate: '2026-03-17',
    nightsCount: 7,
    adults: 2,
    children: 1,
    insuranceIncluded: true,
    validUntil: new Date('2026-02-20'),
    attachments: [
      { type: 'HOTEL_IMAGE', telegramFileId: 'file1' },
      { type: 'ITINERARY_PDF', telegramFileId: 'file2' },
    ],
  };
}

describe('offer-formatter', () => {
  // -------------------------------------------------------------------------
  // Confirm card
  // -------------------------------------------------------------------------

  describe('formatConfirmCard', () => {
    it('should include all sections for a full draft', () => {
      const text = formatConfirmCard(fullDraft());

      expect(text).toContain('Review your offer');
      expect(text).toContain('2,020 USD');
      expect(text).toContain('Flights');
      expect(text).toContain('Excursions');
      expect(text).toContain('Rixos Premium Dubai');
      expect(text).toContain('Emirates');
      expect(text).toContain('EK 713');
      expect(text).toContain('Private');
      expect(text).toContain('2026-03-10');
      expect(text).toContain('7 nights');
      expect(text).toContain('2 adults');
      expect(text).toContain('1 child');
      expect(text).toContain('Insurance');
      expect(text).toContain('2026-02-20');
      expect(text).toContain('2 file(s)');
      expect(text).toContain('Submit this offer?');
    });

    it('should show minimal info for price-only draft', () => {
      const draft = createEmptyDraft();
      draft.totalPrice = 1500;
      draft.currency = 'EUR';
      draft.validUntil = new Date('2026-03-01');

      const text = formatConfirmCard(draft);

      expect(text).toContain('1,500 EUR');
      expect(text).toContain('2026-03-01');
      expect(text).not.toContain('Hotel');
      expect(text).not.toContain('Airline');
      expect(text).not.toContain('Transfer');
      expect(text).not.toContain('Attachments');
    });

    it('should handle transfer not included', () => {
      const draft = createEmptyDraft();
      draft.totalPrice = 1000;
      draft.currency = 'AMD';
      draft.transferIncluded = false;

      const text = formatConfirmCard(draft);

      expect(text).toContain('Transfer:* Not included');
    });

    it('should show includes without excludes', () => {
      const draft = createEmptyDraft();
      draft.totalPrice = 1000;
      draft.currency = 'RUB';
      draft.includes = ['Airport transfer'];

      const text = formatConfirmCard(draft);

      expect(text).toContain('Airport transfer');
      expect(text).not.toContain('Excludes');
    });
  });

  // -------------------------------------------------------------------------
  // Traveler notification
  // -------------------------------------------------------------------------

  describe('formatTravelerNotification', () => {
    it('should format a full offer for the traveler', () => {
      const text = formatTravelerNotification({
        agencyName: 'TravelCo',
        totalPrice: 2020,
        currency: 'USD',
        includes: ['Flights', 'Hotel'],
        excludes: ['Visa'],
        hotelName: 'Rixos Premium Dubai',
        hotelStars: 'FIVE',
        mealPlan: 'UAI',
        hotelLocation: 'JBR Beach',
        airline: 'Emirates',
        departureFlightNumber: 'EK 713',
        returnFlightNumber: 'EK 714',
        baggageIncluded: true,
        flightClass: 'ECONOMY',
        transferIncluded: true,
        transferType: 'PRIVATE',
        departureDate: '2026-03-10',
        returnDate: '2026-03-17',
        nightsCount: 7,
        adults: 2,
        children: 1,
        insuranceIncluded: true,
        validUntil: new Date('2026-02-20'),
      });

      expect(text).toContain('TravelCo');
      expect(text).toContain('2,020 USD');
      expect(text).toContain('Rixos Premium Dubai');
      expect(text).toContain('Emirates');
      expect(text).toContain('Private');
      expect(text).toContain('7 nights');
      expect(text).toContain('Insurance included');
      expect(text).toContain('Valid until');
    });

    it('should format a minimal offer', () => {
      const text = formatTravelerNotification({
        agencyName: 'BasicTravel',
        totalPrice: 500,
        currency: 'EUR',
        validUntil: '2026-03-01',
      });

      expect(text).toContain('BasicTravel');
      expect(text).toContain('500 EUR');
      expect(text).toContain('2026-03-01');
      expect(text).not.toContain('Hotel');
      expect(text).not.toContain('Transfer');
    });

    it('should escape markdown in agency name', () => {
      const text = formatTravelerNotification({
        agencyName: 'Travel*Agency_One',
        totalPrice: 100,
        currency: 'AMD',
        validUntil: '2026-04-01',
      });

      expect(text).toContain('Travel\\*Agency\\_One');
    });
  });

  // -------------------------------------------------------------------------
  // Submit success
  // -------------------------------------------------------------------------

  describe('formatSubmitSuccess', () => {
    it('should show price and validity', () => {
      const draft = createEmptyDraft();
      draft.totalPrice = 1500;
      draft.currency = 'USD';
      draft.validUntil = new Date('2026-03-01');

      const text = formatSubmitSuccess(draft);

      expect(text).toContain('submitted successfully');
      expect(text).toContain('1,500 USD');
      expect(text).toContain('2026-03-01');
    });

    it('should include hotel and airline when present', () => {
      const draft = fullDraft();
      const text = formatSubmitSuccess(draft);

      expect(text).toContain('Rixos Premium Dubai');
      expect(text).toContain('Emirates');
      expect(text).toContain('2 file(s)');
    });

    it('should skip hotel/airline when not set', () => {
      const draft = createEmptyDraft();
      draft.totalPrice = 800;
      draft.currency = 'RUB';
      draft.validUntil = new Date('2026-03-01');

      const text = formatSubmitSuccess(draft);

      expect(text).not.toContain('Hotel');
      expect(text).not.toContain('Airline');
      expect(text).not.toContain('Attachments');
    });
  });
});

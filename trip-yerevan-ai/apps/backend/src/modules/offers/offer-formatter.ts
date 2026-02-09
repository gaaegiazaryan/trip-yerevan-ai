import { Currency, HotelStars, MealPlan, FlightClass, TransferType, OfferStatus } from '@prisma/client';
import { OfferDraft, HOTEL_STARS_OPTIONS, MEAL_PLAN_OPTIONS } from './offer-wizard.types';

function esc(text: string): string {
  // Markdown V1 special chars only: _ * ` [
  return text.replace(/[_*`[]/g, '\\$&');
}

function formatPrice(price: number, currency: Currency): string {
  return `${price.toLocaleString('en-US')} ${currency}`;
}

function formatDate(date: Date | string): string {
  if (typeof date === 'string') return date;
  return date.toISOString().split('T')[0];
}

function starsLabel(stars: HotelStars): string {
  const opt = HOTEL_STARS_OPTIONS.find((o) => o.value === stars);
  return opt ? opt.label : stars;
}

function mealLabel(meal: MealPlan): string {
  const opt = MEAL_PLAN_OPTIONS.find((o) => o.value === meal);
  return opt ? opt.label : meal;
}

function flightClassLabel(fc: FlightClass): string {
  return fc === 'ECONOMY' ? 'Economy' : 'Business';
}

function transferTypeLabel(tt: TransferType): string {
  switch (tt) {
    case 'GROUP':
      return 'Group';
    case 'PRIVATE':
      return 'Private';
    case 'VIP':
      return 'VIP';
  }
}

// =============================================================================
// Confirm card (shown to agency agent before submitting)
// =============================================================================

export function formatConfirmCard(draft: OfferDraft): string {
  const lines: string[] = ['*Review your offer:*', ''];

  // Price
  lines.push(`*Price:* ${formatPrice(draft.totalPrice!, draft.currency!)}`);
  if (draft.includes.length > 0) {
    lines.push(`*Includes:* ${draft.includes.map(esc).join(', ')}`);
  }
  if (draft.excludes.length > 0) {
    lines.push(`*Excludes:* ${draft.excludes.map(esc).join(', ')}`);
  }

  // Hotel
  if (draft.hotelName) {
    lines.push('');
    let hotelLine = `*Hotel:* ${esc(draft.hotelName)}`;
    if (draft.hotelStars) hotelLine += ` ${starsLabel(draft.hotelStars)}`;
    lines.push(hotelLine);
    if (draft.roomType) lines.push(`*Room:* ${esc(draft.roomType)}`);
    if (draft.mealPlan) lines.push(`*Meals:* ${mealLabel(draft.mealPlan)}`);
    if (draft.hotelLocation) lines.push(`*Location:* ${esc(draft.hotelLocation)}`);
    if (draft.hotelDescription) lines.push(`*Description:* ${esc(draft.hotelDescription)}`);
  }

  // Flight
  if (draft.airline) {
    lines.push('');
    let flightLine = `*Airline:* ${esc(draft.airline)}`;
    lines.push(flightLine);
    if (draft.departureFlightNumber) lines.push(`*Departure:* ${esc(draft.departureFlightNumber)}`);
    if (draft.returnFlightNumber) lines.push(`*Return:* ${esc(draft.returnFlightNumber)}`);
    if (draft.baggageIncluded != null) {
      lines.push(`*Baggage:* ${draft.baggageIncluded ? 'Included' : 'Not included'}`);
    }
    if (draft.flightClass) lines.push(`*Class:* ${flightClassLabel(draft.flightClass)}`);
  }

  // Transfer
  if (draft.transferIncluded != null) {
    lines.push('');
    if (draft.transferIncluded) {
      lines.push(`*Transfer:* ${draft.transferType ? transferTypeLabel(draft.transferType) : 'Yes'}`);
    } else {
      lines.push('*Transfer:* Not included');
    }
  }

  // Travel details
  if (draft.departureDate || draft.adults) {
    lines.push('');
    if (draft.departureDate && draft.returnDate) {
      const nights = draft.nightsCount ? ` (${draft.nightsCount} nights)` : '';
      lines.push(`*Dates:* ${draft.departureDate} — ${draft.returnDate}${nights}`);
    } else if (draft.departureDate) {
      lines.push(`*Departure:* ${draft.departureDate}`);
    }
    if (draft.adults != null) {
      let pax = `${draft.adults} adult${draft.adults > 1 ? 's' : ''}`;
      if (draft.children) pax += `, ${draft.children} child${draft.children > 1 ? 'ren' : ''}`;
      lines.push(`*Travelers:* ${pax}`);
    }
    if (draft.insuranceIncluded != null) {
      lines.push(`*Insurance:* ${draft.insuranceIncluded ? 'Included' : 'Not included'}`);
    }
  }

  // Validity
  if (draft.validUntil) {
    lines.push('');
    lines.push(`*Valid until:* ${formatDate(draft.validUntil)}`);
  }

  // Attachments
  if (draft.attachments.length > 0) {
    lines.push('');
    lines.push(`*Attachments:* ${draft.attachments.length} file(s)`);
  }

  lines.push('');
  lines.push('Submit this offer?');

  return lines.join('\n');
}

// =============================================================================
// Traveler notification (sent to the user who created the travel request)
// =============================================================================

export function formatTravelerNotification(data: {
  agencyName: string;
  totalPrice: number;
  currency: Currency;
  includes?: string[];
  excludes?: string[];
  hotelName?: string | null;
  hotelStars?: HotelStars | null;
  mealPlan?: MealPlan | null;
  hotelLocation?: string | null;
  airline?: string | null;
  departureFlightNumber?: string | null;
  returnFlightNumber?: string | null;
  baggageIncluded?: boolean | null;
  flightClass?: FlightClass | null;
  transferIncluded?: boolean | null;
  transferType?: TransferType | null;
  departureDate?: Date | string | null;
  returnDate?: Date | string | null;
  nightsCount?: number | null;
  adults?: number | null;
  children?: number | null;
  insuranceIncluded?: boolean | null;
  validUntil: Date | string;
}): string {
  const lines: string[] = [];

  lines.push(`New offer from *${esc(data.agencyName)}*`);
  lines.push('');

  // Hotel
  if (data.hotelName) {
    let hotelLine = `\ud83c\udfe8 *Hotel:* ${esc(data.hotelName)}`;
    if (data.hotelStars) hotelLine += ` ${starsLabel(data.hotelStars)}`;
    lines.push(hotelLine);
    if (data.mealPlan) lines.push(`\ud83c\udf7d *Meals:* ${mealLabel(data.mealPlan)}`);
    if (data.hotelLocation) lines.push(`\ud83d\udccd *Location:* ${esc(data.hotelLocation)}`);
  }

  // Flight
  if (data.airline) {
    let flightLine = `\u2708\ufe0f ${esc(data.airline)}`;
    if (data.departureFlightNumber) flightLine += ` | ${esc(data.departureFlightNumber)}`;
    if (data.returnFlightNumber) flightLine += ` \u2192 ${esc(data.returnFlightNumber)}`;
    lines.push(flightLine);
    const flightDetails: string[] = [];
    if (data.baggageIncluded != null) {
      flightDetails.push(`Baggage: ${data.baggageIncluded ? 'Included' : 'No'}`);
    }
    if (data.flightClass) flightDetails.push(flightClassLabel(data.flightClass));
    if (flightDetails.length) lines.push(`\ud83d\udcbc ${flightDetails.join(' | ')}`);
  }

  // Transfer
  if (data.transferIncluded) {
    lines.push(
      `\ud83d\ude90 *Transfer:* ${data.transferType ? transferTypeLabel(data.transferType) : 'Included'}`,
    );
  }

  // Dates & travelers
  if (data.departureDate && data.returnDate) {
    const depStr = formatDate(data.departureDate);
    const retStr = formatDate(data.returnDate);
    const nights = data.nightsCount ? ` (${data.nightsCount} nights)` : '';
    lines.push(`\ud83d\udcc5 ${depStr} — ${retStr}${nights}`);
  }
  if (data.adults != null) {
    let pax = `${data.adults} adult${data.adults > 1 ? 's' : ''}`;
    if (data.children) pax += `, ${data.children} child${data.children > 1 ? 'ren' : ''}`;
    lines.push(`\ud83d\udc65 ${pax}`);
    if (data.insuranceIncluded) lines.push('\ud83d\udee1 Insurance included');
  }

  lines.push('');
  lines.push(`\ud83d\udcb0 *${formatPrice(data.totalPrice, data.currency)}*`);
  if (data.includes && data.includes.length > 0) {
    lines.push(`\u2705 ${data.includes.map(esc).join(', ')}`);
  }
  if (data.excludes && data.excludes.length > 0) {
    lines.push(`\u274c ${data.excludes.map(esc).join(', ')}`);
  }

  lines.push('');
  lines.push(`\u23f3 Valid until: ${formatDate(data.validUntil)}`);

  return lines.join('\n');
}

// =============================================================================
// Success message (shown to agency agent after submit)
// =============================================================================

export function formatSubmitSuccess(draft: OfferDraft): string {
  const lines: string[] = ['Offer submitted successfully!', ''];
  lines.push(`*Price:* ${formatPrice(draft.totalPrice!, draft.currency!)}`);
  lines.push(`*Valid until:* ${formatDate(draft.validUntil!)}`);
  if (draft.hotelName) lines.push(`*Hotel:* ${esc(draft.hotelName)}`);
  if (draft.airline) lines.push(`*Airline:* ${esc(draft.airline)}`);
  if (draft.attachments.length > 0) {
    lines.push(`*Attachments:* ${draft.attachments.length} file(s)`);
  }
  return lines.join('\n');
}

// =============================================================================
// Offer list page (paginated list shown to traveler)
// =============================================================================

export const OFFERS_PAGE_SIZE = 3;

export function formatOfferListPage(
  offers: Array<{
    agency: { name: string };
    totalPrice: { toNumber?: () => number } | number;
    currency: Currency;
    hotelName?: string | null;
    hotelStars?: HotelStars | null;
    nightsCount?: number | null;
    airline?: string | null;
    mealPlan?: MealPlan | null;
    status: OfferStatus;
  }>,
  destination: string | null,
  page: number,
  totalPages: number,
  totalOffers: number,
): string {
  const lines: string[] = [];

  const destText = destination ? ` to ${esc(destination)}` : '';
  lines.push(`\ud83d\udccb *Your Offers${destText}*`);
  lines.push(`${totalOffers} offer${totalOffers !== 1 ? 's' : ''} received`);
  lines.push('');

  for (let i = 0; i < offers.length; i++) {
    const o = offers[i];
    const num = page * OFFERS_PAGE_SIZE + i + 1;
    const price = formatPrice(
      typeof o.totalPrice === 'number' ? o.totalPrice : Number(o.totalPrice),
      o.currency,
    );

    let line = `*${num}. ${esc(o.agency.name)}*`;
    if (o.status === OfferStatus.VIEWED) line += ' (viewed)';
    lines.push(line);

    const details: string[] = [`\ud83d\udcb0 ${price}`];
    if (o.hotelName) details.push(`\ud83c\udfe8 ${esc(o.hotelName)}`);
    if (o.hotelStars) details.push(starsLabel(o.hotelStars));
    if (o.airline) details.push(`\u2708\ufe0f ${esc(o.airline)}`);
    if (o.mealPlan) details.push(`\ud83c\udf7d ${mealLabel(o.mealPlan)}`);
    if (o.nightsCount) details.push(`${o.nightsCount} nights`);
    lines.push(details.join(' | '));
    lines.push('');
  }

  if (totalPages > 1) {
    lines.push(`Page ${page + 1}/${totalPages}`);
  }

  lines.push('Tap an offer to see full details.');

  return lines.join('\n');
}

// =============================================================================
// Offer detail card (full view shown to traveler)
// =============================================================================

export function formatOfferDetail(offer: {
  agency: { name: string };
  totalPrice: { toNumber?: () => number } | number;
  currency: Currency;
  priceIncludes: string[];
  priceExcludes: string[];
  hotelName?: string | null;
  hotelStars?: HotelStars | null;
  roomType?: string | null;
  mealPlan?: MealPlan | null;
  hotelLocation?: string | null;
  hotelDescription?: string | null;
  airline?: string | null;
  departureFlightNumber?: string | null;
  returnFlightNumber?: string | null;
  baggageIncluded?: boolean | null;
  flightClass?: FlightClass | null;
  transferIncluded?: boolean | null;
  transferType?: TransferType | null;
  departureDate?: Date | null;
  returnDate?: Date | null;
  nightsCount?: number | null;
  adults?: number | null;
  children?: number | null;
  insuranceIncluded?: boolean | null;
  validUntil: Date;
}): string {
  const lines: string[] = [];
  const price = typeof offer.totalPrice === 'number'
    ? offer.totalPrice
    : Number(offer.totalPrice);

  lines.push(`Offer from *${esc(offer.agency.name)}*`);
  lines.push('');

  // Hotel
  if (offer.hotelName) {
    let hotelLine = `\ud83c\udfe8 *Hotel:* ${esc(offer.hotelName)}`;
    if (offer.hotelStars) hotelLine += ` ${starsLabel(offer.hotelStars)}`;
    lines.push(hotelLine);
    if (offer.roomType) lines.push(`\ud83d\udecf *Room:* ${esc(offer.roomType)}`);
    if (offer.mealPlan) lines.push(`\ud83c\udf7d *Meals:* ${mealLabel(offer.mealPlan)}`);
    if (offer.hotelLocation) lines.push(`\ud83d\udccd *Location:* ${esc(offer.hotelLocation)}`);
    if (offer.hotelDescription) lines.push(`\ud83d\udcdd ${esc(offer.hotelDescription)}`);
  }

  // Flight
  if (offer.airline) {
    lines.push('');
    let flightLine = `\u2708\ufe0f ${esc(offer.airline)}`;
    if (offer.departureFlightNumber) flightLine += ` | ${esc(offer.departureFlightNumber)}`;
    if (offer.returnFlightNumber) flightLine += ` \u2192 ${esc(offer.returnFlightNumber)}`;
    lines.push(flightLine);
    const flightDetails: string[] = [];
    if (offer.baggageIncluded != null) {
      flightDetails.push(`Baggage: ${offer.baggageIncluded ? 'Included' : 'No'}`);
    }
    if (offer.flightClass) flightDetails.push(flightClassLabel(offer.flightClass));
    if (flightDetails.length) lines.push(`\ud83d\udcbc ${flightDetails.join(' | ')}`);
  }

  // Transfer
  if (offer.transferIncluded != null) {
    lines.push('');
    if (offer.transferIncluded) {
      lines.push(
        `\ud83d\ude90 *Transfer:* ${offer.transferType ? transferTypeLabel(offer.transferType) : 'Included'}`,
      );
    } else {
      lines.push('\ud83d\ude90 *Transfer:* Not included');
    }
  }

  // Dates & travelers
  if (offer.departureDate && offer.returnDate) {
    lines.push('');
    const depStr = formatDate(offer.departureDate);
    const retStr = formatDate(offer.returnDate);
    const nights = offer.nightsCount ? ` (${offer.nightsCount} nights)` : '';
    lines.push(`\ud83d\udcc5 ${depStr} — ${retStr}${nights}`);
  }
  if (offer.adults != null) {
    let pax = `${offer.adults} adult${offer.adults > 1 ? 's' : ''}`;
    if (offer.children) pax += `, ${offer.children} child${offer.children > 1 ? 'ren' : ''}`;
    lines.push(`\ud83d\udc65 ${pax}`);
    if (offer.insuranceIncluded) lines.push('\ud83d\udee1 Insurance included');
  }

  // Price
  lines.push('');
  lines.push(`\ud83d\udcb0 *${formatPrice(price, offer.currency)}*`);
  if (offer.priceIncludes.length > 0) {
    lines.push(`\u2705 ${offer.priceIncludes.map(esc).join(', ')}`);
  }
  if (offer.priceExcludes.length > 0) {
    lines.push(`\u274c ${offer.priceExcludes.map(esc).join(', ')}`);
  }

  // Validity
  lines.push('');
  lines.push(`\u23f3 Valid until: ${formatDate(offer.validUntil)}`);

  return lines.join('\n');
}

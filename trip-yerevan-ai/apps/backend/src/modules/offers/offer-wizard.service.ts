import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  Currency,
  HotelStars,
  MealPlan,
  FlightClass,
  TransferType,
  OfferStatus,
  RfqDeliveryStatus,
} from '@prisma/client';
import {
  OfferWizardSection,
  OfferWizardState,
  WizardStepResult,
  OfferSubmitResult,
  PriceStep,
  HotelStep,
  FlightStep,
  TransferStep,
  TravelDetailsStep,
  ValidityStep,
  AttachmentsStep,
  DraftAttachment,
  SECTION_ORDER,
  SKIPPABLE_SECTIONS,
  ALLOWED_CURRENCIES,
  HOTEL_STARS_OPTIONS,
  MEAL_PLAN_OPTIONS,
  FLIGHT_CLASS_OPTIONS,
  TRANSFER_TYPE_OPTIONS,
  VALIDITY_OPTIONS,
  MAX_ATTACHMENTS,
  createEmptyDraft,
} from './offer-wizard.types';
import {
  validatePrice,
  parsePrice,
  validateFutureDate,
  validateDate,
  validateDatePair,
  validatePositiveInt,
  validateListItem,
  validateListSize,
  parseListItems,
  validateHotelName,
  validateHotelDescription,
  validateAirline,
  validateFlightNumber,
  validateStringLength,
} from './offer-wizard-validators';
import { formatConfirmCard, formatSubmitSuccess } from './offer-formatter';
import { AgencyMembershipService } from '../agencies/agency-membership.service';

@Injectable()
export class OfferWizardService {
  private readonly logger = new Logger(OfferWizardService.name);
  private readonly wizards = new Map<number, OfferWizardState>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly membershipService: AgencyMembershipService,
  ) {}

  // ===========================================================================
  // Public API
  // ===========================================================================

  hasActiveWizard(chatId: number): boolean {
    return this.wizards.has(chatId);
  }

  isOnAttachmentsStep(chatId: number): boolean {
    const state = this.wizards.get(chatId);
    return (
      !!state &&
      state.section === OfferWizardSection.ATTACHMENTS &&
      state.subStep === AttachmentsStep.UPLOAD
    );
  }

  async startWizard(
    chatId: number,
    travelRequestId: string,
    telegramId: bigint,
  ): Promise<WizardStepResult> {
    this.logger.log(
      `[wizard:start] chatId=${chatId}, travelRequestId=${travelRequestId}`,
    );

    const agent = await this.resolveAgent(telegramId, chatId);
    if (!agent) {
      return {
        text: 'You are not authorized to submit offers. Please register as an agency agent first.',
      };
    }

    const existing = await this.prisma.offer.findUnique({
      where: {
        travelRequestId_agencyId: {
          travelRequestId,
          agencyId: agent.agencyId,
        },
      },
    });

    if (existing) {
      return {
        text: `An offer has already been submitted for this request (ID: ${existing.id.slice(0, 8)}...). Only one offer per agency is allowed.`,
      };
    }

    const travelRequest = await this.prisma.travelRequest.findUnique({
      where: { id: travelRequestId },
      select: { id: true, destination: true },
    });

    if (!travelRequest) {
      return { text: 'Travel request not found.' };
    }

    this.wizards.set(chatId, {
      section: OfferWizardSection.PRICE,
      subStep: PriceStep.TOTAL_PRICE,
      travelRequestId,
      agencyId: agent.agencyId,
      membershipId: agent.id,
      draft: createEmptyDraft(),
    });

    this.logger.log(
      `[wizard:started] chatId=${chatId}, agent=${agent.id}, agency=${agent.agencyId}`,
    );

    return {
      text:
        `*Submit Offer${travelRequest.destination ? ` — ${this.esc(travelRequest.destination)}` : ''}*\n\n` +
        `Section 1/7: *Price*\n` +
        `Enter the *total price* (number only):`,
    };
  }

  async handleCallback(
    chatId: number,
    callbackData: string,
  ): Promise<WizardStepResult | OfferSubmitResult> {
    const state = this.wizards.get(chatId);
    if (!state) {
      return { text: 'No active offer wizard. Click "Submit Offer" on an RFQ to start.' };
    }

    // Cancel
    if (callbackData === 'offer:cancel') {
      this.wizards.delete(chatId);
      this.logger.log(`[wizard:cancelled] chatId=${chatId}`);
      return { text: 'Offer submission cancelled.' };
    }

    // Submit
    if (callbackData === 'offer:submit') {
      return this.handleSubmit(chatId, state);
    }

    // Back
    if (callbackData === 'offer:back') {
      return this.handleBack(chatId, state);
    }

    // Skip section
    if (callbackData.startsWith('offer:skip:')) {
      const section = callbackData.replace('offer:skip:', '') as OfferWizardSection;
      return this.handleSkipSection(chatId, state, section);
    }

    // Edit from confirm
    if (callbackData.startsWith('offer:edit:')) {
      const section = callbackData.replace('offer:edit:', '') as OfferWizardSection;
      return this.handleEditSection(chatId, state, section);
    }

    // Currency
    if (callbackData.startsWith('offer:cur:')) {
      return this.handleCurrencyCallback(chatId, state, callbackData);
    }

    // Validity
    if (callbackData.startsWith('offer:ttl:')) {
      return this.handleValidityCallback(chatId, state, callbackData);
    }

    // Includes done/skip
    if (callbackData === 'offer:inc:done' || callbackData === 'offer:inc:skip') {
      return this.handleIncludesDone(chatId, state);
    }

    // Excludes done/skip
    if (callbackData === 'offer:exc:done' || callbackData === 'offer:exc:skip') {
      return this.handleExcludesDone(chatId, state);
    }

    // Hotel stars
    if (callbackData.startsWith('offer:stars:')) {
      return this.handleStarsCallback(chatId, state, callbackData);
    }

    // Meal plan
    if (callbackData.startsWith('offer:meal:')) {
      return this.handleMealCallback(chatId, state, callbackData);
    }

    // Baggage
    if (callbackData.startsWith('offer:bag:')) {
      return this.handleBaggageCallback(chatId, state, callbackData);
    }

    // Flight class
    if (callbackData.startsWith('offer:fclass:')) {
      return this.handleFlightClassCallback(chatId, state, callbackData);
    }

    // Transfer included
    if (callbackData.startsWith('offer:trf:')) {
      return this.handleTransferIncludedCallback(chatId, state, callbackData);
    }

    // Transfer type
    if (callbackData.startsWith('offer:trft:')) {
      return this.handleTransferTypeCallback(chatId, state, callbackData);
    }

    // Insurance
    if (callbackData.startsWith('offer:ins:')) {
      return this.handleInsuranceCallback(chatId, state, callbackData);
    }

    // Attachments done/skip
    if (callbackData === 'offer:att:done' || callbackData === 'offer:att:skip') {
      return this.advanceFromSection(chatId, state);
    }

    return { text: 'Unknown action.' };
  }

  async handleTextInput(
    chatId: number,
    text: string,
  ): Promise<WizardStepResult> {
    const state = this.wizards.get(chatId);
    if (!state) {
      return { text: 'No active offer wizard.' };
    }

    // List collection mode
    if (state.collectingList) {
      return this.handleListInput(chatId, state, text);
    }

    switch (state.subStep) {
      // Price section
      case PriceStep.TOTAL_PRICE:
        return this.handlePriceInput(chatId, state, text);

      // Hotel section
      case HotelStep.HOTEL_NAME:
        return this.handleHotelNameInput(chatId, state, text);
      case HotelStep.ROOM_TYPE:
        return this.handleRoomTypeInput(chatId, state, text);
      case HotelStep.HOTEL_LOCATION:
        return this.handleHotelLocationInput(chatId, state, text);
      case HotelStep.HOTEL_DESCRIPTION:
        return this.handleHotelDescriptionInput(chatId, state, text);

      // Flight section
      case FlightStep.AIRLINE:
        return this.handleAirlineInput(chatId, state, text);
      case FlightStep.DEPARTURE_FLIGHT:
        return this.handleDepartureFlightInput(chatId, state, text);
      case FlightStep.RETURN_FLIGHT:
        return this.handleReturnFlightInput(chatId, state, text);

      // Travel details
      case TravelDetailsStep.DEPARTURE_DATE:
        return this.handleDepartureDateInput(chatId, state, text);
      case TravelDetailsStep.RETURN_DATE:
        return this.handleReturnDateInput(chatId, state, text);
      case TravelDetailsStep.NIGHTS_COUNT:
        return this.handleNightsInput(chatId, state, text);
      case TravelDetailsStep.ADULTS:
        return this.handleAdultsInput(chatId, state, text);
      case TravelDetailsStep.CHILDREN:
        return this.handleChildrenInput(chatId, state, text);

      // Validity
      case ValidityStep.VALID_UNTIL:
        return this.handleValidUntilTextInput(chatId, state, text);

      default:
        return { text: 'Please use the buttons to proceed.' };
    }
  }

  handleAttachment(
    chatId: number,
    attachment: DraftAttachment,
  ): WizardStepResult {
    const state = this.wizards.get(chatId);
    if (!state || !this.isOnAttachmentsStep(chatId)) {
      return { text: 'Not accepting attachments right now.' };
    }

    if (state.draft.attachments.length >= MAX_ATTACHMENTS) {
      return {
        text: `Maximum ${MAX_ATTACHMENTS} attachments reached. Press "Done" to continue.`,
        buttons: [{ label: 'Done', callbackData: 'offer:att:done' }],
      };
    }

    state.draft.attachments.push(attachment);
    this.wizards.set(chatId, state);

    const count = state.draft.attachments.length;
    return {
      text: `Attachment ${count}/${MAX_ATTACHMENTS} received. Send more or press "Done".`,
      buttons: [{ label: 'Done', callbackData: 'offer:att:done' }],
    };
  }

  cancelWizard(chatId: number): void {
    this.wizards.delete(chatId);
  }

  // ===========================================================================
  // Price section handlers
  // ===========================================================================

  private handlePriceInput(
    chatId: number,
    state: OfferWizardState,
    text: string,
  ): WizardStepResult {
    const v = validatePrice(text);
    if (!v.valid) return { text: v.error! };

    state.draft.totalPrice = parsePrice(text);
    state.subStep = PriceStep.CURRENCY;
    this.wizards.set(chatId, state);

    return {
      text: `Price: *${state.draft.totalPrice.toLocaleString('en-US')}*\n\nSelect currency:`,
      buttons: ALLOWED_CURRENCIES.map((c) => ({
        label: c,
        callbackData: `offer:cur:${c}`,
      })),
    };
  }

  private handleCurrencyCallback(
    chatId: number,
    state: OfferWizardState,
    callbackData: string,
  ): WizardStepResult {
    if (state.subStep !== PriceStep.CURRENCY) {
      return { text: 'Please complete the current step first.' };
    }

    const code = callbackData.replace('offer:cur:', '') as Currency;
    if (!ALLOWED_CURRENCIES.includes(code)) {
      return { text: 'Invalid currency. Please use the buttons.' };
    }

    state.draft.currency = code;
    state.subStep = PriceStep.INCLUDES;
    state.collectingList = 'includes';
    this.wizards.set(chatId, state);

    return {
      text:
        `Currency: *${code}*\n\n` +
        `What's *included* in the price? Enter items (comma\\-separated or one by one), or press Skip\\.`,
      buttons: [{ label: 'Skip', callbackData: 'offer:inc:skip' }],
    };
  }

  private handleIncludesDone(
    chatId: number,
    state: OfferWizardState,
  ): WizardStepResult {
    state.collectingList = undefined;
    state.subStep = PriceStep.EXCLUDES;
    state.collectingList = 'excludes';
    this.wizards.set(chatId, state);

    return {
      text: `What's *excluded* from the price? Enter items (comma\\-separated or one by one), or press Skip\\.`,
      buttons: [{ label: 'Skip', callbackData: 'offer:exc:skip' }],
    };
  }

  private handleExcludesDone(
    chatId: number,
    state: OfferWizardState,
  ): WizardStepResult {
    state.collectingList = undefined;
    return this.advanceFromSection(chatId, state);
  }

  private handleListInput(
    chatId: number,
    state: OfferWizardState,
    text: string,
  ): WizardStepResult {
    const listKey = state.collectingList!;
    const list = state.draft[listKey];
    const items = parseListItems(text);

    for (const item of items) {
      const vItem = validateListItem(item);
      if (!vItem.valid) return { text: vItem.error! };
      const vSize = validateListSize(list.length);
      if (!vSize.valid) return { text: vSize.error! };
      list.push(item);
    }

    this.wizards.set(chatId, state);

    const doneKey = listKey === 'includes' ? 'offer:inc:done' : 'offer:exc:done';
    const label = listKey === 'includes' ? 'Includes' : 'Excludes';

    return {
      text: `${label}: ${list.map((i) => `_${this.esc(i)}_`).join(', ')}\n\nAdd more or press Done.`,
      buttons: [{ label: 'Done', callbackData: doneKey }],
    };
  }

  // ===========================================================================
  // Hotel section handlers
  // ===========================================================================

  private handleHotelNameInput(
    chatId: number,
    state: OfferWizardState,
    text: string,
  ): WizardStepResult {
    const v = validateHotelName(text);
    if (!v.valid) return { text: v.error! };

    state.draft.hotelName = text.trim();
    state.subStep = HotelStep.HOTEL_STARS;
    this.wizards.set(chatId, state);

    return {
      text: `Hotel: *${this.esc(state.draft.hotelName)}*\n\nSelect star rating:`,
      buttons: HOTEL_STARS_OPTIONS.map((o) => ({
        label: o.label,
        callbackData: `offer:stars:${o.value}`,
      })),
    };
  }

  private handleStarsCallback(
    chatId: number,
    state: OfferWizardState,
    callbackData: string,
  ): WizardStepResult {
    if (state.subStep !== HotelStep.HOTEL_STARS) {
      return { text: 'Please complete the current step first.' };
    }

    const value = callbackData.replace('offer:stars:', '') as HotelStars;
    const valid = HOTEL_STARS_OPTIONS.some((o) => o.value === value);
    if (!valid) return { text: 'Invalid option. Please use the buttons.' };

    state.draft.hotelStars = value;
    state.subStep = HotelStep.ROOM_TYPE;
    this.wizards.set(chatId, state);

    return { text: 'Enter the *room type* (e.g., Deluxe, Standard, Suite):' };
  }

  private handleRoomTypeInput(
    chatId: number,
    state: OfferWizardState,
    text: string,
  ): WizardStepResult {
    const v = validateStringLength(text, 200, 'Room type');
    if (!v.valid) return { text: v.error! };

    state.draft.roomType = text.trim();
    state.subStep = HotelStep.MEAL_PLAN;
    this.wizards.set(chatId, state);

    return {
      text: 'Select *meal plan*:',
      buttons: MEAL_PLAN_OPTIONS.map((o) => ({
        label: o.label,
        callbackData: `offer:meal:${o.value}`,
      })),
    };
  }

  private handleMealCallback(
    chatId: number,
    state: OfferWizardState,
    callbackData: string,
  ): WizardStepResult {
    if (state.subStep !== HotelStep.MEAL_PLAN) {
      return { text: 'Please complete the current step first.' };
    }

    const value = callbackData.replace('offer:meal:', '') as MealPlan;
    const valid = MEAL_PLAN_OPTIONS.some((o) => o.value === value);
    if (!valid) return { text: 'Invalid option. Please use the buttons.' };

    state.draft.mealPlan = value;
    state.subStep = HotelStep.HOTEL_LOCATION;
    this.wizards.set(chatId, state);

    return { text: 'Enter the *hotel location* (e.g., JBR Beach, City Center):' };
  }

  private handleHotelLocationInput(
    chatId: number,
    state: OfferWizardState,
    text: string,
  ): WizardStepResult {
    const v = validateStringLength(text, 200, 'Hotel location');
    if (!v.valid) return { text: v.error! };

    state.draft.hotelLocation = text.trim();
    state.subStep = HotelStep.HOTEL_DESCRIPTION;
    this.wizards.set(chatId, state);

    return { text: 'Enter a short *hotel description* (optional, max 500 chars):' };
  }

  private handleHotelDescriptionInput(
    chatId: number,
    state: OfferWizardState,
    text: string,
  ): WizardStepResult {
    const v = validateHotelDescription(text);
    if (!v.valid) return { text: v.error! };

    state.draft.hotelDescription = text.trim();
    return this.advanceFromSection(chatId, state);
  }

  // ===========================================================================
  // Flight section handlers
  // ===========================================================================

  private handleAirlineInput(
    chatId: number,
    state: OfferWizardState,
    text: string,
  ): WizardStepResult {
    const v = validateAirline(text);
    if (!v.valid) return { text: v.error! };

    state.draft.airline = text.trim();
    state.subStep = FlightStep.DEPARTURE_FLIGHT;
    this.wizards.set(chatId, state);

    return { text: 'Enter the *departure flight number* (e.g., EK 713):' };
  }

  private handleDepartureFlightInput(
    chatId: number,
    state: OfferWizardState,
    text: string,
  ): WizardStepResult {
    const v = validateFlightNumber(text);
    if (!v.valid) return { text: v.error! };

    state.draft.departureFlightNumber = text.trim();
    state.subStep = FlightStep.RETURN_FLIGHT;
    this.wizards.set(chatId, state);

    return { text: 'Enter the *return flight number* (e.g., EK 714):' };
  }

  private handleReturnFlightInput(
    chatId: number,
    state: OfferWizardState,
    text: string,
  ): WizardStepResult {
    const v = validateFlightNumber(text);
    if (!v.valid) return { text: v.error! };

    state.draft.returnFlightNumber = text.trim();
    state.subStep = FlightStep.BAGGAGE;
    this.wizards.set(chatId, state);

    return {
      text: 'Is *baggage* included?',
      buttons: [
        { label: 'Yes', callbackData: 'offer:bag:yes' },
        { label: 'No', callbackData: 'offer:bag:no' },
      ],
    };
  }

  private handleBaggageCallback(
    chatId: number,
    state: OfferWizardState,
    callbackData: string,
  ): WizardStepResult {
    if (state.subStep !== FlightStep.BAGGAGE) {
      return { text: 'Please complete the current step first.' };
    }

    state.draft.baggageIncluded = callbackData === 'offer:bag:yes';
    state.subStep = FlightStep.FLIGHT_CLASS;
    this.wizards.set(chatId, state);

    return {
      text: 'Select *flight class*:',
      buttons: FLIGHT_CLASS_OPTIONS.map((o) => ({
        label: o.label,
        callbackData: `offer:fclass:${o.value}`,
      })),
    };
  }

  private handleFlightClassCallback(
    chatId: number,
    state: OfferWizardState,
    callbackData: string,
  ): WizardStepResult {
    if (state.subStep !== FlightStep.FLIGHT_CLASS) {
      return { text: 'Please complete the current step first.' };
    }

    const value = callbackData.replace('offer:fclass:', '') as FlightClass;
    const valid = FLIGHT_CLASS_OPTIONS.some((o) => o.value === value);
    if (!valid) return { text: 'Invalid option. Please use the buttons.' };

    state.draft.flightClass = value;
    return this.advanceFromSection(chatId, state);
  }

  // ===========================================================================
  // Transfer section handlers
  // ===========================================================================

  private handleTransferIncludedCallback(
    chatId: number,
    state: OfferWizardState,
    callbackData: string,
  ): WizardStepResult {
    if (state.subStep !== TransferStep.TRANSFER_INCLUDED) {
      return { text: 'Please complete the current step first.' };
    }

    const included = callbackData === 'offer:trf:yes';
    state.draft.transferIncluded = included;

    if (!included) {
      return this.advanceFromSection(chatId, state);
    }

    state.subStep = TransferStep.TRANSFER_TYPE;
    this.wizards.set(chatId, state);

    return {
      text: 'Select *transfer type*:',
      buttons: TRANSFER_TYPE_OPTIONS.map((o) => ({
        label: o.label,
        callbackData: `offer:trft:${o.value}`,
      })),
    };
  }

  private handleTransferTypeCallback(
    chatId: number,
    state: OfferWizardState,
    callbackData: string,
  ): WizardStepResult {
    if (state.subStep !== TransferStep.TRANSFER_TYPE) {
      return { text: 'Please complete the current step first.' };
    }

    const value = callbackData.replace('offer:trft:', '') as TransferType;
    const valid = TRANSFER_TYPE_OPTIONS.some((o) => o.value === value);
    if (!valid) return { text: 'Invalid option. Please use the buttons.' };

    state.draft.transferType = value;
    return this.advanceFromSection(chatId, state);
  }

  // ===========================================================================
  // Travel details section handlers
  // ===========================================================================

  private handleDepartureDateInput(
    chatId: number,
    state: OfferWizardState,
    text: string,
  ): WizardStepResult {
    const v = validateDate(text);
    if (!v.valid) return { text: v.error! };

    state.draft.departureDate = text.trim();
    state.subStep = TravelDetailsStep.RETURN_DATE;
    this.wizards.set(chatId, state);

    return { text: 'Enter the *return date* (YYYY\\-MM\\-DD):' };
  }

  private handleReturnDateInput(
    chatId: number,
    state: OfferWizardState,
    text: string,
  ): WizardStepResult {
    const v = validateDatePair(state.draft.departureDate!, text);
    if (!v.valid) return { text: v.error! };

    state.draft.returnDate = text.trim();
    state.subStep = TravelDetailsStep.NIGHTS_COUNT;
    this.wizards.set(chatId, state);

    return { text: 'Enter the *number of nights* (1\\-365):' };
  }

  private handleNightsInput(
    chatId: number,
    state: OfferWizardState,
    text: string,
  ): WizardStepResult {
    const v = validatePositiveInt(text, 1, 365, 'Nights');
    if (!v.valid) return { text: v.error! };

    state.draft.nightsCount = Number(text.trim());
    state.subStep = TravelDetailsStep.ADULTS;
    this.wizards.set(chatId, state);

    return { text: 'Enter the *number of adults* (1\\-20):' };
  }

  private handleAdultsInput(
    chatId: number,
    state: OfferWizardState,
    text: string,
  ): WizardStepResult {
    const v = validatePositiveInt(text, 1, 20, 'Adults');
    if (!v.valid) return { text: v.error! };

    state.draft.adults = Number(text.trim());
    state.subStep = TravelDetailsStep.CHILDREN;
    this.wizards.set(chatId, state);

    return { text: 'Enter the *number of children* (0\\-20):' };
  }

  private handleChildrenInput(
    chatId: number,
    state: OfferWizardState,
    text: string,
  ): WizardStepResult {
    const v = validatePositiveInt(text, 0, 20, 'Children');
    if (!v.valid) return { text: v.error! };

    state.draft.children = Number(text.trim());
    state.subStep = TravelDetailsStep.INSURANCE;
    this.wizards.set(chatId, state);

    return {
      text: 'Is *insurance* included?',
      buttons: [
        { label: 'Yes', callbackData: 'offer:ins:yes' },
        { label: 'No', callbackData: 'offer:ins:no' },
      ],
    };
  }

  private handleInsuranceCallback(
    chatId: number,
    state: OfferWizardState,
    callbackData: string,
  ): WizardStepResult {
    if (state.subStep !== TravelDetailsStep.INSURANCE) {
      return { text: 'Please complete the current step first.' };
    }

    state.draft.insuranceIncluded = callbackData === 'offer:ins:yes';
    return this.advanceFromSection(chatId, state);
  }

  // ===========================================================================
  // Validity section handlers
  // ===========================================================================

  private handleValidityCallback(
    chatId: number,
    state: OfferWizardState,
    callbackData: string,
  ): WizardStepResult {
    if (state.subStep !== ValidityStep.VALID_UNTIL) {
      return { text: 'Please complete the current step first.' };
    }

    const key = callbackData.replace('offer:ttl:', '') as keyof typeof VALIDITY_OPTIONS;
    const days = VALIDITY_OPTIONS[key];
    if (!days) {
      return { text: 'Invalid option. Please use the buttons or enter a date (YYYY-MM-DD).' };
    }

    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + days);
    validUntil.setHours(23, 59, 59, 999);

    state.draft.validUntil = validUntil;
    return this.advanceFromSection(chatId, state);
  }

  private handleValidUntilTextInput(
    chatId: number,
    state: OfferWizardState,
    text: string,
  ): WizardStepResult {
    const v = validateFutureDate(text);
    if (!v.valid) return { text: v.error! };

    const parsed = new Date(text.trim());
    parsed.setHours(23, 59, 59, 999);
    state.draft.validUntil = parsed;
    return this.advanceFromSection(chatId, state);
  }

  // ===========================================================================
  // Navigation: advance, skip, back, edit
  // ===========================================================================

  private advanceFromSection(
    chatId: number,
    state: OfferWizardState,
  ): WizardStepResult {
    // If editing from confirm, return to confirm
    if (state.editingFromConfirm) {
      state.editingFromConfirm = false;
      state.section = OfferWizardSection.CONFIRM;
      state.subStep = PriceStep.TOTAL_PRICE; // doesn't matter for CONFIRM
      this.wizards.set(chatId, state);
      return this.buildConfirmPrompt(state);
    }

    const currentIndex = SECTION_ORDER.indexOf(state.section);
    const nextIndex = currentIndex + 1;

    if (nextIndex >= SECTION_ORDER.length) {
      // Should not happen — CONFIRM is last
      return this.buildConfirmPrompt(state);
    }

    const nextSection = SECTION_ORDER[nextIndex];
    return this.enterSection(chatId, state, nextSection);
  }

  private handleSkipSection(
    chatId: number,
    state: OfferWizardState,
    section: OfferWizardSection,
  ): WizardStepResult {
    if (!SKIPPABLE_SECTIONS.has(section)) {
      return { text: 'This section cannot be skipped.' };
    }

    // If we're editing from confirm, go back to confirm
    if (state.editingFromConfirm) {
      state.editingFromConfirm = false;
      state.section = OfferWizardSection.CONFIRM;
      this.wizards.set(chatId, state);
      return this.buildConfirmPrompt(state);
    }

    const currentIndex = SECTION_ORDER.indexOf(section);
    const nextSection = SECTION_ORDER[currentIndex + 1];
    return this.enterSection(chatId, state, nextSection);
  }

  private handleEditSection(
    chatId: number,
    state: OfferWizardState,
    section: OfferWizardSection,
  ): WizardStepResult {
    if (state.section !== OfferWizardSection.CONFIRM) {
      return { text: 'Editing is only available from the confirmation screen.' };
    }

    state.editingFromConfirm = true;
    return this.enterSection(chatId, state, section);
  }

  private handleBack(
    chatId: number,
    state: OfferWizardState,
  ): WizardStepResult {
    const currentIndex = SECTION_ORDER.indexOf(state.section);
    if (currentIndex <= 0) {
      return { text: 'You are at the first section.' };
    }

    const prevSection = SECTION_ORDER[currentIndex - 1];
    state.editingFromConfirm = false;
    return this.enterSection(chatId, state, prevSection);
  }

  private enterSection(
    chatId: number,
    state: OfferWizardState,
    section: OfferWizardSection,
  ): WizardStepResult {
    state.section = section;
    state.collectingList = undefined;
    const sectionNum = SECTION_ORDER.indexOf(section) + 1;

    switch (section) {
      case OfferWizardSection.PRICE:
        state.subStep = PriceStep.TOTAL_PRICE;
        this.wizards.set(chatId, state);
        return {
          text: `Section ${sectionNum}/7: *Price*\nEnter the *total price* (number only):`,
        };

      case OfferWizardSection.HOTEL:
        state.subStep = HotelStep.HOTEL_NAME;
        this.wizards.set(chatId, state);
        return {
          text: `Section ${sectionNum}/7: *Hotel*\nEnter the *hotel name*:`,
          buttons: [{ label: 'Skip Hotel', callbackData: 'offer:skip:HOTEL' }],
        };

      case OfferWizardSection.FLIGHT:
        state.subStep = FlightStep.AIRLINE;
        this.wizards.set(chatId, state);
        return {
          text: `Section ${sectionNum}/7: *Flight*\nEnter the *airline name*:`,
          buttons: [{ label: 'Skip Flight', callbackData: 'offer:skip:FLIGHT' }],
        };

      case OfferWizardSection.TRANSFER:
        state.subStep = TransferStep.TRANSFER_INCLUDED;
        this.wizards.set(chatId, state);
        return {
          text: `Section ${sectionNum}/7: *Transfer*\nIs transfer included?`,
          buttons: [
            { label: 'Yes', callbackData: 'offer:trf:yes' },
            { label: 'No', callbackData: 'offer:trf:no' },
            { label: 'Skip', callbackData: 'offer:skip:TRANSFER' },
          ],
        };

      case OfferWizardSection.TRAVEL_DETAILS:
        state.subStep = TravelDetailsStep.DEPARTURE_DATE;
        this.wizards.set(chatId, state);
        return {
          text: `Section ${sectionNum}/7: *Travel Details*\nEnter the *departure date* (YYYY\\-MM\\-DD):`,
          buttons: [
            { label: 'Skip Details', callbackData: 'offer:skip:TRAVEL_DETAILS' },
          ],
        };

      case OfferWizardSection.VALIDITY:
        state.subStep = ValidityStep.VALID_UNTIL;
        this.wizards.set(chatId, state);
        return {
          text: `Section ${sectionNum}/7: *Validity*\nHow long is this offer valid?`,
          buttons: [
            { label: '1 day', callbackData: 'offer:ttl:1d' },
            { label: '3 days', callbackData: 'offer:ttl:3d' },
            { label: '7 days', callbackData: 'offer:ttl:7d' },
          ],
        };

      case OfferWizardSection.ATTACHMENTS:
        state.subStep = AttachmentsStep.UPLOAD;
        this.wizards.set(chatId, state);
        return {
          text:
            `Section ${sectionNum}/7: *Attachments*\n` +
            `Send photos or documents (max ${MAX_ATTACHMENTS}), or press Skip.`,
          buttons: [
            { label: 'Skip', callbackData: 'offer:att:skip' },
          ],
        };

      case OfferWizardSection.CONFIRM:
        this.wizards.set(chatId, state);
        return this.buildConfirmPrompt(state);
    }
  }

  // ===========================================================================
  // Confirm + Submit
  // ===========================================================================

  private buildConfirmPrompt(state: OfferWizardState): WizardStepResult {
    const text = formatConfirmCard(state.draft);

    const editButtons: { label: string; callbackData: string }[] = [];

    // Only offer edit for sections that have data
    if (state.draft.totalPrice != null) {
      editButtons.push({ label: 'Edit Price', callbackData: 'offer:edit:PRICE' });
    }
    if (state.draft.hotelName) {
      editButtons.push({ label: 'Edit Hotel', callbackData: 'offer:edit:HOTEL' });
    }
    if (state.draft.airline) {
      editButtons.push({ label: 'Edit Flight', callbackData: 'offer:edit:FLIGHT' });
    }
    if (state.draft.transferIncluded != null) {
      editButtons.push({ label: 'Edit Transfer', callbackData: 'offer:edit:TRANSFER' });
    }
    if (state.draft.departureDate) {
      editButtons.push({ label: 'Edit Details', callbackData: 'offer:edit:TRAVEL_DETAILS' });
    }
    if (state.draft.validUntil) {
      editButtons.push({ label: 'Edit Validity', callbackData: 'offer:edit:VALIDITY' });
    }

    return {
      text,
      buttons: [
        { label: '\u2705 Submit', callbackData: 'offer:submit' },
        ...editButtons,
        { label: '\u21a9\ufe0f Cancel', callbackData: 'offer:cancel' },
      ],
    };
  }

  private async handleSubmit(
    chatId: number,
    state: OfferWizardState,
  ): Promise<OfferSubmitResult> {
    if (state.section !== OfferWizardSection.CONFIRM) {
      return {
        text: 'Please complete all steps before submitting.',
        offerId: '',
        travelerTelegramId: BigInt(0),
        travelRequestId: state.travelRequestId,
      };
    }

    const { draft } = state;

    // Pre-submit validation
    if (!draft.totalPrice || !draft.currency || !draft.validUntil) {
      return {
        text: 'Missing required fields (price, currency, validity). Please complete them first.',
        offerId: '',
        travelerTelegramId: BigInt(0),
        travelRequestId: state.travelRequestId,
      };
    }

    // Idempotency check
    const existing = await this.prisma.offer.findUnique({
      where: {
        travelRequestId_agencyId: {
          travelRequestId: state.travelRequestId,
          agencyId: state.agencyId,
        },
      },
    });

    if (existing) {
      this.wizards.delete(chatId);
      return {
        text: 'An offer was already submitted for this request.',
        offerId: existing.id,
        travelerTelegramId: BigInt(0),
        travelRequestId: state.travelRequestId,
      };
    }

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const offer = await tx.offer.create({
          data: {
            travelRequestId: state.travelRequestId,
            agencyId: state.agencyId,
            membershipId: state.membershipId,
            status: OfferStatus.SUBMITTED,
            totalPrice: draft.totalPrice!,
            currency: draft.currency!,
            description: '', // Legacy field — now structured
            validUntil: draft.validUntil!,
            priceIncludes: draft.includes,
            priceExcludes: draft.excludes,
            hotelName: draft.hotelName ?? null,
            hotelStars: draft.hotelStars ?? null,
            roomType: draft.roomType ?? null,
            mealPlan: draft.mealPlan ?? null,
            hotelLocation: draft.hotelLocation ?? null,
            hotelDescription: draft.hotelDescription ?? null,
            airline: draft.airline ?? null,
            departureFlightNumber: draft.departureFlightNumber ?? null,
            returnFlightNumber: draft.returnFlightNumber ?? null,
            baggageIncluded: draft.baggageIncluded ?? null,
            flightClass: draft.flightClass ?? null,
            transferIncluded: draft.transferIncluded ?? null,
            transferType: draft.transferType ?? null,
            departureDate: draft.departureDate ? new Date(draft.departureDate) : null,
            returnDate: draft.returnDate ? new Date(draft.returnDate) : null,
            nightsCount: draft.nightsCount ?? null,
            adults: draft.adults ?? null,
            children: draft.children ?? null,
            insuranceIncluded: draft.insuranceIncluded ?? null,
          },
        });

        // Persist attachments
        if (draft.attachments.length > 0) {
          await tx.offerAttachment.createMany({
            data: draft.attachments.map((a) => ({
              offerId: offer.id,
              type: a.type,
              telegramFileId: a.telegramFileId,
              fileName: a.fileName ?? null,
              mimeType: a.mimeType ?? null,
            })),
          });
        }

        // Update rfqDistribution → RESPONDED
        await tx.rfqDistribution.updateMany({
          where: {
            travelRequestId: state.travelRequestId,
            agencyId: state.agencyId,
          },
          data: {
            deliveryStatus: RfqDeliveryStatus.RESPONDED,
            respondedAt: new Date(),
          },
        });

        const travelRequest = await tx.travelRequest.findUniqueOrThrow({
          where: { id: state.travelRequestId },
          include: { user: { select: { telegramId: true } } },
        });

        return { offer, travelerTelegramId: travelRequest.user.telegramId };
      });

      this.wizards.delete(chatId);

      this.logger.log(
        `[wizard:submitted] offerId=${result.offer.id}, ` +
          `request=${state.travelRequestId}, agency=${state.agencyId}, ` +
          `price=${draft.totalPrice} ${draft.currency}`,
      );

      return {
        text: formatSubmitSuccess(draft),
        offerId: result.offer.id,
        travelerTelegramId: result.travelerTelegramId,
        travelRequestId: state.travelRequestId,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[wizard:submit-failed] chatId=${chatId}, request=${state.travelRequestId}: ${reason}`,
        error instanceof Error ? error.stack : undefined,
      );

      return {
        text: 'Failed to submit offer. Please try again.',
        offerId: '',
        travelerTelegramId: BigInt(0),
        travelRequestId: state.travelRequestId,
      };
    }
  }

  // ===========================================================================
  // Agent resolution
  // ===========================================================================

  private async resolveAgent(
    telegramId: bigint,
    chatId: number,
  ): Promise<{ id: string; agencyId: string } | null> {
    const user = await this.prisma.user.findUnique({
      where: { telegramId },
    });

    if (!user) {
      this.logger.warn(`[wizard:no-user] telegramId=${telegramId}`);
      return null;
    }

    return this.membershipService.resolveOrCreateMembership(user.id, chatId);
  }

  // ===========================================================================
  // Helpers
  // ===========================================================================

  private esc(text: string): string {
    // Markdown V1 special chars only: _ * ` [
    return text.replace(/[_*`[]/g, '\\$&');
  }
}

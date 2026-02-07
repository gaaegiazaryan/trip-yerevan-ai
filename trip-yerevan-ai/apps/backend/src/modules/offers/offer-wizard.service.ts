import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  AgentRole,
  AgentStatus,
  Currency,
  OfferStatus,
  RfqDeliveryStatus,
} from '@prisma/client';
import {
  OfferWizardStep,
  OfferWizardState,
  WizardStepResult,
  OfferSubmitResult,
  ALLOWED_CURRENCIES,
  MAX_NOTE_LENGTH,
  VALIDITY_OPTIONS,
} from './offer-wizard.types';

@Injectable()
export class OfferWizardService {
  private readonly logger = new Logger(OfferWizardService.name);
  private readonly wizards = new Map<number, OfferWizardState>();

  constructor(private readonly prisma: PrismaService) {}

  hasActiveWizard(chatId: number): boolean {
    return this.wizards.has(chatId);
  }

  /**
   * Starts the offer wizard for an agency agent.
   * Resolves agent identity, checks idempotency, initializes wizard state.
   */
  async startWizard(
    chatId: number,
    travelRequestId: string,
    telegramId: bigint,
  ): Promise<WizardStepResult> {
    this.logger.log(
      `[wizard:start] chatId=${chatId}, travelRequestId=${travelRequestId}, telegramId=${telegramId}`,
    );

    // 1. Resolve agent
    const agent = await this.resolveAgent(telegramId, chatId);
    if (!agent) {
      return {
        text: 'You are not authorized to submit offers. Please register as an agency agent first.',
      };
    }

    // 2. Idempotency check
    const existing = await this.prisma.offer.findUnique({
      where: {
        travelRequestId_agencyId: {
          travelRequestId,
          agencyId: agent.agencyId,
        },
      },
    });

    if (existing) {
      this.logger.log(
        `[wizard:duplicate] Offer ${existing.id} already exists for request=${travelRequestId}, agency=${agent.agencyId}`,
      );
      return {
        text: `An offer has already been submitted for this request (ID: ${existing.id.slice(0, 8)}...). Only one offer per agency is allowed.`,
      };
    }

    // 3. Verify travel request exists
    const travelRequest = await this.prisma.travelRequest.findUnique({
      where: { id: travelRequestId },
      select: { id: true, destination: true },
    });

    if (!travelRequest) {
      return { text: 'Travel request not found.' };
    }

    // 4. Initialize wizard state
    this.wizards.set(chatId, {
      step: OfferWizardStep.PRICE,
      travelRequestId,
      agencyId: agent.agencyId,
      agentId: agent.id,
    });

    this.logger.log(
      `[wizard:started] chatId=${chatId}, agent=${agent.id}, agency=${agent.agencyId}`,
    );

    return this.buildPricePrompt(travelRequest.destination);
  }

  /**
   * Handles inline keyboard callbacks during wizard (currency, validity, submit, cancel).
   */
  async handleCallback(
    chatId: number,
    callbackData: string,
  ): Promise<WizardStepResult | OfferSubmitResult> {
    const state = this.wizards.get(chatId);
    if (!state) {
      return { text: 'No active offer wizard. Click "Submit Offer" on an RFQ to start.' };
    }

    // offer:cancel
    if (callbackData === 'offer:cancel') {
      this.wizards.delete(chatId);
      this.logger.log(`[wizard:cancelled] chatId=${chatId}`);
      return { text: 'Offer submission cancelled.' };
    }

    // offer:cur:<CODE>
    if (callbackData.startsWith('offer:cur:')) {
      return this.handleCurrencyCallback(chatId, state, callbackData);
    }

    // offer:ttl:<duration>
    if (callbackData.startsWith('offer:ttl:')) {
      return this.handleValidityCallback(chatId, state, callbackData);
    }

    // offer:submit
    if (callbackData === 'offer:submit') {
      return this.handleSubmit(chatId, state);
    }

    return { text: 'Unknown action.' };
  }

  /**
   * Handles free-text input during wizard (price, note, custom date).
   */
  async handleTextInput(
    chatId: number,
    text: string,
  ): Promise<WizardStepResult> {
    const state = this.wizards.get(chatId);
    if (!state) {
      return { text: 'No active offer wizard.' };
    }

    switch (state.step) {
      case OfferWizardStep.PRICE:
        return this.handlePriceInput(chatId, state, text);
      case OfferWizardStep.VALID_UNTIL:
        return this.handleDateInput(chatId, state, text);
      case OfferWizardStep.NOTE:
        return this.handleNoteInput(chatId, state, text);
      default:
        return { text: 'Please use the buttons to proceed.' };
    }
  }

  cancelWizard(chatId: number): void {
    this.wizards.delete(chatId);
  }

  // ---------------------------------------------------------------------------
  // Step handlers
  // ---------------------------------------------------------------------------

  private handlePriceInput(
    chatId: number,
    state: OfferWizardState,
    text: string,
  ): WizardStepResult {
    const price = Number(text.replace(/[,\s]/g, ''));

    if (isNaN(price) || price <= 0) {
      return {
        text: 'Please enter a valid positive number for the price.\n\nExample: `1500` or `2,500`',
      };
    }

    if (price > 999_999_999) {
      return { text: 'Price is too large. Please enter a realistic amount.' };
    }

    state.priceTotal = price;
    state.step = OfferWizardStep.CURRENCY;
    this.wizards.set(chatId, state);

    return this.buildCurrencyPrompt(price);
  }

  private handleCurrencyCallback(
    chatId: number,
    state: OfferWizardState,
    callbackData: string,
  ): WizardStepResult {
    if (state.step !== OfferWizardStep.CURRENCY) {
      return { text: 'Please complete the current step first.' };
    }

    const code = callbackData.replace('offer:cur:', '') as Currency;

    if (!ALLOWED_CURRENCIES.includes(code)) {
      return { text: 'Invalid currency. Please use the buttons.' };
    }

    state.currency = code;
    state.step = OfferWizardStep.VALID_UNTIL;
    this.wizards.set(chatId, state);

    return this.buildValidityPrompt();
  }

  private handleValidityCallback(
    chatId: number,
    state: OfferWizardState,
    callbackData: string,
  ): WizardStepResult {
    if (state.step !== OfferWizardStep.VALID_UNTIL) {
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

    state.validUntil = validUntil;
    state.step = OfferWizardStep.NOTE;
    this.wizards.set(chatId, state);

    return this.buildNotePrompt();
  }

  private handleDateInput(
    chatId: number,
    state: OfferWizardState,
    text: string,
  ): WizardStepResult {
    if (state.step !== OfferWizardStep.VALID_UNTIL) {
      return { text: 'Please use the buttons to proceed.' };
    }

    const parsed = new Date(text.trim());

    if (isNaN(parsed.getTime())) {
      return { text: 'Invalid date format. Please enter a date as YYYY-MM-DD or use the buttons.' };
    }

    parsed.setHours(23, 59, 59, 999);

    if (parsed.getTime() <= Date.now()) {
      return { text: 'Date must be in the future. Please enter a valid future date.' };
    }

    state.validUntil = parsed;
    state.step = OfferWizardStep.NOTE;
    this.wizards.set(chatId, state);

    return this.buildNotePrompt();
  }

  private handleNoteInput(
    chatId: number,
    state: OfferWizardState,
    text: string,
  ): WizardStepResult {
    if (text.length > MAX_NOTE_LENGTH) {
      return {
        text: `Note is too long (${text.length}/${MAX_NOTE_LENGTH} chars). Please shorten it.`,
      };
    }

    state.note = text.trim();
    state.step = OfferWizardStep.CONFIRM;
    this.wizards.set(chatId, state);

    return this.buildConfirmationCard(state);
  }

  // ---------------------------------------------------------------------------
  // Submit
  // ---------------------------------------------------------------------------

  private async handleSubmit(
    chatId: number,
    state: OfferWizardState,
  ): Promise<OfferSubmitResult> {
    if (state.step !== OfferWizardStep.CONFIRM) {
      return {
        text: 'Please complete all steps before submitting.',
        offerId: '',
        travelerTelegramId: BigInt(0),
        travelRequestId: state.travelRequestId,
      };
    }

    // Double-check idempotency before DB write
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
        // Create offer
        const offer = await tx.offer.create({
          data: {
            travelRequestId: state.travelRequestId,
            agencyId: state.agencyId,
            agentId: state.agentId,
            status: OfferStatus.SUBMITTED,
            totalPrice: state.priceTotal!,
            currency: state.currency!,
            description: state.note || '',
            validUntil: state.validUntil!,
          },
        });

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

        // Load traveler info for notification
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
          `price=${state.priceTotal} ${state.currency}`,
      );

      return {
        text:
          `Offer submitted successfully!\n\n` +
          `*Price:* ${this.formatPrice(state.priceTotal!, state.currency!)}\n` +
          `*Valid until:* ${this.formatDate(state.validUntil!)}\n` +
          `*Note:* ${state.note || '—'}`,
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

  // ---------------------------------------------------------------------------
  // Agent resolution
  // ---------------------------------------------------------------------------

  private async resolveAgent(
    telegramId: bigint,
    chatId: number,
  ): Promise<{ id: string; agencyId: string } | null> {
    // 1. Find user by telegramId
    const user = await this.prisma.user.findUnique({
      where: { telegramId },
      include: { agencyAgent: true },
    });

    if (!user) {
      this.logger.warn(`[wizard:no-user] telegramId=${telegramId}`);
      return null;
    }

    // 2. If user already has an AgencyAgent record, use it
    if (user.agencyAgent) {
      return { id: user.agencyAgent.id, agencyId: user.agencyAgent.agencyId };
    }

    // 3. Bootstrap: auto-create AgencyAgent if chat matches an agency's telegramChatId
    const agency = await this.prisma.agency.findFirst({
      where: { telegramChatId: BigInt(chatId) },
    });

    if (!agency) {
      this.logger.warn(
        `[wizard:no-agency] User ${user.id} (telegramId=${telegramId}) ` +
          `has no AgencyAgent and chatId=${chatId} doesn't match any agency`,
      );
      return null;
    }

    // Auto-create agent record
    const agent = await this.prisma.agencyAgent.create({
      data: {
        agencyId: agency.id,
        userId: user.id,
        role: AgentRole.OWNER,
        status: AgentStatus.ACTIVE,
      },
    });

    this.logger.log(
      `[wizard:agent-created] Auto-created AgencyAgent ${agent.id} ` +
        `for user ${user.id} in agency ${agency.id}`,
    );

    return { id: agent.id, agencyId: agent.agencyId };
  }

  // ---------------------------------------------------------------------------
  // Prompt builders
  // ---------------------------------------------------------------------------

  private buildPricePrompt(destination: string | null): WizardStepResult {
    return {
      text:
        `*Submit Offer${destination ? ` — ${this.escapeMarkdown(destination)}` : ''}*\n\n` +
        `Step 1/4: Enter the *total price* (number only):`,
    };
  }

  private buildCurrencyPrompt(price: number): WizardStepResult {
    return {
      text: `Price: *${price.toLocaleString('en-US')}*\n\nStep 2/4: Select currency:`,
      buttons: ALLOWED_CURRENCIES.map((c) => ({
        label: c,
        callbackData: `offer:cur:${c}`,
      })),
    };
  }

  private buildValidityPrompt(): WizardStepResult {
    return {
      text: 'Step 3/4: How long is this offer valid?',
      buttons: [
        { label: '1 day', callbackData: 'offer:ttl:1d' },
        { label: '3 days', callbackData: 'offer:ttl:3d' },
        { label: '7 days', callbackData: 'offer:ttl:7d' },
      ],
    };
  }

  private buildNotePrompt(): WizardStepResult {
    return {
      text: `Step 4/4: Enter a short description or note for the traveler (max ${MAX_NOTE_LENGTH} chars):`,
    };
  }

  private buildConfirmationCard(state: OfferWizardState): WizardStepResult {
    const lines = [
      '*Review your offer:*',
      '',
      `*Price:* ${this.formatPrice(state.priceTotal!, state.currency!)}`,
      `*Valid until:* ${this.formatDate(state.validUntil!)}`,
      `*Note:* ${state.note ? this.escapeMarkdown(state.note) : '—'}`,
      '',
      'Submit this offer?',
    ];

    return {
      text: lines.join('\n'),
      buttons: [
        { label: '\u2705 Submit', callbackData: 'offer:submit' },
        { label: '\u21a9\ufe0f Cancel', callbackData: 'offer:cancel' },
      ],
    };
  }

  // ---------------------------------------------------------------------------
  // Formatting helpers
  // ---------------------------------------------------------------------------

  private formatPrice(price: number, currency: Currency): string {
    return `${price.toLocaleString('en-US')} ${currency}`;
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
  }
}

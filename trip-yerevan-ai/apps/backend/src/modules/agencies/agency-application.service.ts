import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import {
  AgencyApplicationStatus,
  AgencyStatus,
  AgentRole,
  AgentStatus,
} from '@prisma/client';
import {
  AgencyWizardStep,
  AgencyWizardState,
  WizardStepResult,
  SPECIALIZATION_OPTIONS,
  SPECIALIZATION_LABELS,
  COUNTRY_OPTIONS,
  PHONE_REGEX,
} from './agency-wizard.types';

@Injectable()
export class AgencyApplicationService {
  private readonly logger = new Logger(AgencyApplicationService.name);
  private readonly wizards = new Map<number, AgencyWizardState>();

  /** Tracks chatIds waiting for a rejection reason text input */
  private readonly pendingRejectReason = new Map<
    number,
    { applicationId: string; reviewerUserId: string }
  >();

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Wizard state
  // ---------------------------------------------------------------------------

  hasActiveWizard(chatId: number): boolean {
    return this.wizards.has(chatId);
  }

  hasPendingRejectReason(chatId: number): boolean {
    return this.pendingRejectReason.has(chatId);
  }

  // ---------------------------------------------------------------------------
  // Start / resume wizard
  // ---------------------------------------------------------------------------

  async startOrResume(
    chatId: number,
    telegramId: bigint,
  ): Promise<WizardStepResult> {
    this.logger.log(
      `[agency:start] chatId=${chatId}, telegramId=${telegramId}`,
    );

    // Check if already has an approved agency
    const existingAgency = await this.prisma.agency.findFirst({
      where: { telegramChatId: BigInt(chatId) },
    });

    if (existingAgency && existingAgency.status === AgencyStatus.APPROVED) {
      return {
        text: `Your agency *${existingAgency.name}* is approved. You will receive RFQ notifications in this chat.`,
      };
    }

    // Check for pending/under-review application
    const existingApp = await this.prisma.agencyApplication.findFirst({
      where: {
        applicantTelegramId: telegramId,
        status: { in: ['SUBMITTED', 'UNDER_REVIEW'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingApp) {
      return {
        text: 'Your agency application is currently under review. We will notify you once a decision is made.',
      };
    }

    // Resume active wizard
    if (this.wizards.has(chatId)) {
      const state = this.wizards.get(chatId)!;
      return this.buildCurrentStepPrompt(state);
    }

    // Start new wizard
    const state: AgencyWizardState = {
      step: AgencyWizardStep.NAME,
      telegramId,
      specializations: [],
      countries: [],
    };
    this.wizards.set(chatId, state);

    this.logger.log(`[agency:wizard-started] chatId=${chatId}`);

    return {
      text:
        '*Agency Registration*\n\n' +
        'Step 1/4: Enter your *agency name*:',
    };
  }

  // ---------------------------------------------------------------------------
  // Text input handler
  // ---------------------------------------------------------------------------

  async handleTextInput(
    chatId: number,
    text: string,
  ): Promise<WizardStepResult> {
    // Handle rejection reason input
    if (this.pendingRejectReason.has(chatId)) {
      return this.handleRejectReasonInput(chatId, text);
    }

    const state = this.wizards.get(chatId);
    if (!state) {
      return { text: 'No active registration wizard. Use /agency to start.' };
    }

    switch (state.step) {
      case AgencyWizardStep.NAME:
        return this.handleNameInput(chatId, state, text);
      case AgencyWizardStep.PHONE:
        return this.handlePhoneInput(chatId, state, text);
      default:
        return { text: 'Please use the buttons to proceed.' };
    }
  }

  // ---------------------------------------------------------------------------
  // Callback handler
  // ---------------------------------------------------------------------------

  async handleCallback(
    chatId: number,
    data: string,
  ): Promise<WizardStepResult> {
    // agency:cancel
    if (data === 'agency:cancel') {
      this.wizards.delete(chatId);
      this.logger.log(`[agency:cancelled] chatId=${chatId}`);
      return { text: 'Agency registration cancelled.' };
    }

    // agency:submit
    if (data === 'agency:submit') {
      return this.handleSubmit(chatId);
    }

    // agency:spec:<type> — toggle specialization
    if (data.startsWith('agency:spec:')) {
      return this.handleSpecializationToggle(chatId, data);
    }

    // agency:country:<name> — toggle country
    if (data.startsWith('agency:country:')) {
      return this.handleCountryToggle(chatId, data);
    }

    return { text: 'Unknown action.' };
  }

  // ---------------------------------------------------------------------------
  // Review methods
  // ---------------------------------------------------------------------------

  async findPendingApplications(): Promise<
    { id: string; draftData: unknown; createdAt: Date }[]
  > {
    return this.prisma.agencyApplication.findMany({
      where: { status: AgencyApplicationStatus.SUBMITTED },
      orderBy: { createdAt: 'asc' },
      select: { id: true, draftData: true, createdAt: true },
    });
  }

  async getApplicationDetails(applicationId: string): Promise<WizardStepResult> {
    const app = await this.prisma.agencyApplication.findUnique({
      where: { id: applicationId },
    });

    if (!app) {
      return { text: 'Application not found.' };
    }

    const data = app.draftData as {
      name: string;
      phone: string;
      specializations: string[];
      countries: string[];
    };

    const lines = [
      '*Agency Application*',
      '',
      `*Name:* ${data.name}`,
      `*Phone:* ${data.phone}`,
      `*Specializations:* ${data.specializations.map((s) => SPECIALIZATION_LABELS[s] || s).join(', ') || '—'}`,
      `*Regions:* ${data.countries.join(', ') || '—'}`,
      `*Submitted:* ${app.createdAt.toISOString().split('T')[0]}`,
      `*Status:* ${app.status}`,
    ];

    return {
      text: lines.join('\n'),
      buttons: [
        { label: 'Approve', callbackData: `review:approve:${applicationId}` },
        { label: 'Reject', callbackData: `review:reject:${applicationId}` },
      ],
    };
  }

  async approveApplication(
    applicationId: string,
    reviewerUserId: string,
  ): Promise<{ agencyId: string; applicantTelegramId: bigint }> {
    const app = await this.prisma.agencyApplication.findUniqueOrThrow({
      where: { id: applicationId },
    });

    const data = app.draftData as {
      name: string;
      phone: string;
      specializations: string[];
      countries: string[];
      chatId: number;
    };

    const result = await this.prisma.$transaction(async (tx) => {
      // Create agency
      const agency = await tx.agency.create({
        data: {
          name: data.name,
          contactPhone: data.phone,
          telegramChatId: BigInt(data.chatId),
          status: AgencyStatus.APPROVED,
          specializations: data.specializations,
          regions: data.countries,
          verifiedAt: new Date(),
          verifiedByUserId: reviewerUserId,
        },
      });

      // Create agent for the applicant (find/create user)
      let user = await tx.user.findFirst({
        where: { telegramId: app.applicantTelegramId },
      });

      if (user) {
        await tx.agencyAgent.create({
          data: {
            agencyId: agency.id,
            userId: user.id,
            role: AgentRole.OWNER,
            status: AgentStatus.ACTIVE,
          },
        });
      }

      // Update application
      await tx.agencyApplication.update({
        where: { id: applicationId },
        data: {
          status: AgencyApplicationStatus.APPROVED,
          reviewerUserId,
          decidedAt: new Date(),
        },
      });

      return { agencyId: agency.id };
    });

    this.logger.log(
      `[agency:approved] applicationId=${applicationId}, agencyId=${result.agencyId}`,
    );

    return {
      agencyId: result.agencyId,
      applicantTelegramId: app.applicantTelegramId,
    };
  }

  async rejectApplication(
    applicationId: string,
    reviewerUserId: string,
    reason: string,
  ): Promise<{ applicantTelegramId: bigint }> {
    const app = await this.prisma.agencyApplication.update({
      where: { id: applicationId },
      data: {
        status: AgencyApplicationStatus.REJECTED,
        reviewerUserId,
        decisionReason: reason,
        decidedAt: new Date(),
      },
    });

    this.logger.log(
      `[agency:rejected] applicationId=${applicationId}, reason=${reason}`,
    );

    return { applicantTelegramId: app.applicantTelegramId };
  }

  /** Sets up the "waiting for reason" state for rejection flow */
  setPendingRejectReason(
    chatId: number,
    applicationId: string,
    reviewerUserId: string,
  ): WizardStepResult {
    this.pendingRejectReason.set(chatId, { applicationId, reviewerUserId });
    return {
      text: 'Please enter the reason for rejection:',
    };
  }

  // ---------------------------------------------------------------------------
  // Step handlers (private)
  // ---------------------------------------------------------------------------

  private handleNameInput(
    chatId: number,
    state: AgencyWizardState,
    text: string,
  ): WizardStepResult {
    const name = text.trim();

    if (name.length < 2) {
      return { text: 'Agency name must be at least 2 characters.' };
    }

    if (name.length > 100) {
      return { text: 'Agency name must be 100 characters or less.' };
    }

    state.name = name;
    state.step = AgencyWizardStep.PHONE;
    this.wizards.set(chatId, state);

    return {
      text: `Agency: *${name}*\n\nStep 2/4: Enter your *contact phone number* (e.g. +37491123456):`,
    };
  }

  private handlePhoneInput(
    chatId: number,
    state: AgencyWizardState,
    text: string,
  ): WizardStepResult {
    const phone = text.trim().replace(/[\s\-()]/g, '');

    if (!PHONE_REGEX.test(phone)) {
      return {
        text: 'Invalid phone number. Please enter a number like +37491123456 (7-15 digits, optional + prefix).',
      };
    }

    state.phone = phone;
    state.step = AgencyWizardStep.SPECIALIZATIONS;
    this.wizards.set(chatId, state);

    return this.buildSpecializationsPrompt(state);
  }

  private handleSpecializationToggle(
    chatId: number,
    data: string,
  ): WizardStepResult {
    const state = this.wizards.get(chatId);
    if (!state || state.step !== AgencyWizardStep.SPECIALIZATIONS) {
      return { text: 'Please complete the current step first.' };
    }

    const key = data.replace('agency:spec:', '');

    if (key === 'done') {
      state.step = AgencyWizardStep.COUNTRIES;
      this.wizards.set(chatId, state);
      return this.buildCountriesPrompt(state);
    }

    if (!SPECIALIZATION_OPTIONS.includes(key as any)) {
      return { text: 'Invalid specialization.' };
    }

    // Toggle
    const idx = state.specializations.indexOf(key);
    if (idx >= 0) {
      state.specializations.splice(idx, 1);
    } else {
      state.specializations.push(key);
    }
    this.wizards.set(chatId, state);

    return this.buildSpecializationsPrompt(state);
  }

  private handleCountryToggle(
    chatId: number,
    data: string,
  ): WizardStepResult {
    const state = this.wizards.get(chatId);
    if (!state || state.step !== AgencyWizardStep.COUNTRIES) {
      return { text: 'Please complete the current step first.' };
    }

    const key = data.replace('agency:country:', '');

    if (key === 'done') {
      state.step = AgencyWizardStep.CONFIRM;
      this.wizards.set(chatId, state);
      return this.buildConfirmationCard(state);
    }

    if (!COUNTRY_OPTIONS.includes(key as any)) {
      return { text: 'Invalid country/region.' };
    }

    // Toggle
    const idx = state.countries.indexOf(key);
    if (idx >= 0) {
      state.countries.splice(idx, 1);
    } else {
      state.countries.push(key);
    }
    this.wizards.set(chatId, state);

    return this.buildCountriesPrompt(state);
  }

  private async handleSubmit(chatId: number): Promise<WizardStepResult> {
    const state = this.wizards.get(chatId);
    if (!state || state.step !== AgencyWizardStep.CONFIRM) {
      return { text: 'Please complete all steps before submitting.' };
    }

    if (!state.name || !state.phone) {
      return { text: 'Missing required fields. Please restart with /agency.' };
    }

    // Check for duplicate name
    const existingAgency = await this.prisma.agency.findUnique({
      where: { name: state.name },
    });

    if (existingAgency) {
      return {
        text: `An agency named "${state.name}" already exists. Please choose a different name and restart with /agency.`,
      };
    }

    try {
      await this.prisma.agencyApplication.create({
        data: {
          applicantTelegramId: state.telegramId,
          draftData: {
            name: state.name,
            phone: state.phone,
            specializations: state.specializations,
            countries: state.countries,
            chatId,
          },
          status: AgencyApplicationStatus.SUBMITTED,
        },
      });

      this.wizards.delete(chatId);

      this.logger.log(
        `[agency:submitted] chatId=${chatId}, name="${state.name}"`,
      );

      return {
        text:
          'Your agency application has been submitted successfully!\n\n' +
          'A manager will review it shortly. You will be notified when a decision is made.',
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[agency:submit-failed] chatId=${chatId}: ${reason}`,
        error instanceof Error ? error.stack : undefined,
      );

      return { text: 'Failed to submit application. Please try again.' };
    }
  }

  private async handleRejectReasonInput(
    chatId: number,
    text: string,
  ): Promise<WizardStepResult> {
    const pending = this.pendingRejectReason.get(chatId);
    if (!pending) {
      return { text: 'No pending rejection.' };
    }

    this.pendingRejectReason.delete(chatId);

    const reason = text.trim();
    if (!reason) {
      return { text: 'Rejection reason cannot be empty. Application was not rejected.' };
    }

    const result = await this.rejectApplication(
      pending.applicationId,
      pending.reviewerUserId,
      reason,
    );

    return {
      text: `Application rejected.\n\n*Reason:* ${reason}`,
      buttons: undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // Prompt builders
  // ---------------------------------------------------------------------------

  private buildCurrentStepPrompt(state: AgencyWizardState): WizardStepResult {
    switch (state.step) {
      case AgencyWizardStep.NAME:
        return {
          text: '*Agency Registration*\n\nStep 1/4: Enter your *agency name*:',
        };
      case AgencyWizardStep.PHONE:
        return {
          text: `Agency: *${state.name}*\n\nStep 2/4: Enter your *contact phone number*:`,
        };
      case AgencyWizardStep.SPECIALIZATIONS:
        return this.buildSpecializationsPrompt(state);
      case AgencyWizardStep.COUNTRIES:
        return this.buildCountriesPrompt(state);
      case AgencyWizardStep.CONFIRM:
        return this.buildConfirmationCard(state);
    }
  }

  private buildSpecializationsPrompt(
    state: AgencyWizardState,
  ): WizardStepResult {
    const selected = state.specializations;
    const lines = [
      'Step 3/4: Select your *specializations* (toggle to select/deselect):',
      '',
    ];

    if (selected.length > 0) {
      lines.push(
        `Selected: ${selected.map((s) => SPECIALIZATION_LABELS[s] || s).join(', ')}`,
        '',
      );
    }

    const buttons = SPECIALIZATION_OPTIONS.map((opt) => {
      const isSelected = selected.includes(opt);
      return {
        label: `${isSelected ? '\u2705 ' : ''}${SPECIALIZATION_LABELS[opt] || opt}`,
        callbackData: `agency:spec:${opt}`,
      };
    });

    buttons.push({ label: 'Done \u2192', callbackData: 'agency:spec:done' });

    return { text: lines.join('\n'), buttons };
  }

  private buildCountriesPrompt(state: AgencyWizardState): WizardStepResult {
    const selected = state.countries;
    const lines = [
      'Step 4/4: Select *destination countries/regions* you serve:',
      '',
    ];

    if (selected.length > 0) {
      lines.push(`Selected: ${selected.join(', ')}`, '');
    }

    const buttons = COUNTRY_OPTIONS.map((opt) => {
      const isSelected = selected.includes(opt);
      return {
        label: `${isSelected ? '\u2705 ' : ''}${opt}`,
        callbackData: `agency:country:${opt}`,
      };
    });

    buttons.push({
      label: 'Done \u2192',
      callbackData: 'agency:country:done',
    });

    return { text: lines.join('\n'), buttons };
  }

  private buildConfirmationCard(state: AgencyWizardState): WizardStepResult {
    const lines = [
      '*Review your agency application:*',
      '',
      `*Name:* ${state.name}`,
      `*Phone:* ${state.phone}`,
      `*Specializations:* ${state.specializations.map((s) => SPECIALIZATION_LABELS[s] || s).join(', ') || '—'}`,
      `*Regions:* ${state.countries.join(', ') || '—'}`,
      '',
      'Submit this application?',
    ];

    return {
      text: lines.join('\n'),
      buttons: [
        { label: '\u2705 Submit', callbackData: 'agency:submit' },
        { label: '\u21a9\ufe0f Cancel', callbackData: 'agency:cancel' },
      ],
    };
  }
}

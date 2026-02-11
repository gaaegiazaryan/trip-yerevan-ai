import { Injectable, Logger } from '@nestjs/common';
import {
  MeetingProposalWizardSection,
  MeetingProposalWizardState,
  MeetingProposalDraft,
  WizardResponse,
  PROPOSAL_SECTION_ORDER,
  TIME_PRESETS,
  LOCATION_PRESETS,
  MAX_PROPOSAL_DAYS_AHEAD,
  MAX_NOTES_LENGTH,
  MAX_LOCATION_LENGTH,
  createEmptyProposalDraft,
} from './meeting-proposal-wizard.types';

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class MeetingProposalWizardService {
  private readonly logger = new Logger(MeetingProposalWizardService.name);
  private readonly states = new Map<number, MeetingProposalWizardState>();

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  start(
    chatId: number,
    bookingId: string,
    isCounter = false,
    originalProposalId?: string,
    prefill?: Partial<MeetingProposalDraft>,
  ): WizardResponse {
    const draft = createEmptyProposalDraft(bookingId);
    if (prefill) {
      if (prefill.date) draft.date = prefill.date;
      if (prefill.time) draft.time = prefill.time;
      if (prefill.location) draft.location = prefill.location;
      if (prefill.notes) draft.notes = prefill.notes;
    }

    this.states.set(chatId, {
      section: MeetingProposalWizardSection.DATE,
      draft,
      bookingId,
      isCounterProposal: isCounter,
      originalProposalId,
    });

    this.logger.log(
      `[proposal-wizard] Started for chatId=${chatId}, booking=${bookingId}, isCounter=${isCounter}`,
    );

    return this.buildDateSection();
  }

  handleCallback(chatId: number, data: string): WizardResponse {
    const state = this.states.get(chatId);
    if (!state) {
      return { text: 'No active proposal wizard. Please start again.' };
    }

    // Route by callback prefix
    if (data.startsWith('mpw:d:')) {
      return this.handleDateSelect(state, chatId, data.slice(6));
    }
    if (data.startsWith('mpw:t:')) {
      return this.handleTimeSelect(state, chatId, data.slice(6));
    }
    if (data.startsWith('mpw:l:')) {
      return this.handleLocationSelect(state, chatId, data.slice(6));
    }
    if (data === 'mpw:n:skip') {
      return this.handleNotesSkip(state, chatId);
    }
    if (data === 'mpw:send') {
      return this.handleSend(state, chatId);
    }
    if (data === 'mpw:cancel') {
      return this.handleCancel(chatId);
    }
    if (data.startsWith('mpw:edit:')) {
      return this.handleEdit(state, chatId, data.slice(9));
    }

    return { text: 'Unknown wizard action.' };
  }

  handleTextInput(chatId: number, text: string): WizardResponse {
    const state = this.states.get(chatId);
    if (!state) {
      return { text: 'No active proposal wizard.' };
    }

    if (!state.awaitingTextInput) {
      return { text: 'Not expecting text input right now.' };
    }

    state.awaitingTextInput = false;

    switch (state.section) {
      case MeetingProposalWizardSection.TIME:
        return this.handleCustomTimeText(state, chatId, text);
      case MeetingProposalWizardSection.LOCATION:
        return this.handleCustomLocationText(state, chatId, text);
      case MeetingProposalWizardSection.NOTES:
        return this.handleNotesText(state, chatId, text);
      default:
        return { text: 'Unexpected text input.' };
    }
  }

  isActive(chatId: number): boolean {
    return this.states.has(chatId);
  }

  cancel(chatId: number): void {
    this.states.delete(chatId);
  }

  getState(chatId: number): MeetingProposalWizardState | undefined {
    return this.states.get(chatId);
  }

  // -----------------------------------------------------------------------
  // Section builders
  // -----------------------------------------------------------------------

  private buildDateSection(): WizardResponse {
    const buttons: { label: string; callbackData: string }[] = [];
    const now = new Date();

    // Show next 14 days
    for (let i = 1; i <= 14; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const dateStr = this.formatDateISO(d);
      const label = this.formatDateShort(d);
      buttons.push({ label, callbackData: `mpw:d:${dateStr}` });
    }

    return {
      text:
        '\ud83d\udcc5 *Propose Meeting Date*\n\n' +
        'Select a date for the meeting:',
      buttons,
    };
  }

  private buildTimeSection(): WizardResponse {
    const buttons: { label: string; callbackData: string }[] = TIME_PRESETS.map(
      (t) => ({
        label: t,
        callbackData: `mpw:t:${t}`,
      }),
    );
    buttons.push({ label: 'Custom time', callbackData: 'mpw:t:custom' });

    return {
      text:
        '\u23f0 *Select Meeting Time*\n\n' +
        'Choose a time slot or enter a custom time:',
      buttons,
    };
  }

  private buildLocationSection(): WizardResponse {
    const buttons: { label: string; callbackData: string }[] =
      LOCATION_PRESETS.map((l) => ({
        label: l.label,
        callbackData: `mpw:l:${l.value}`,
      }));
    buttons.push({
      label: 'Custom location',
      callbackData: 'mpw:l:custom',
    });

    return {
      text:
        '\ud83d\udccd *Meeting Location*\n\n' +
        'Select a location or enter a custom one:',
      buttons,
    };
  }

  private buildNotesSection(): WizardResponse {
    return {
      text:
        '\ud83d\udcdd *Additional Notes* (optional)\n\n' +
        'Type any notes for the meeting, or skip:',
      buttons: [{ label: 'Skip', callbackData: 'mpw:n:skip' }],
    };
  }

  private buildConfirmSection(draft: MeetingProposalDraft): WizardResponse {
    const lines = [
      '\ud83d\udccb *Meeting Proposal Summary*\n',
      `\ud83d\udcc5 *Date:* ${draft.date}`,
      `\u23f0 *Time:* ${draft.time}`,
      `\ud83d\udccd *Location:* ${draft.location ?? 'Not specified'}`,
    ];
    if (draft.notes) {
      lines.push(`\ud83d\udcdd *Notes:* ${draft.notes}`);
    }
    lines.push('', 'Confirm and send this proposal?');

    const buttons = [
      { label: '\u2705 Send Proposal', callbackData: 'mpw:send' },
      { label: 'Edit Date', callbackData: 'mpw:edit:DATE' },
      { label: 'Edit Time', callbackData: 'mpw:edit:TIME' },
      { label: 'Edit Location', callbackData: 'mpw:edit:LOCATION' },
      { label: 'Edit Notes', callbackData: 'mpw:edit:NOTES' },
      { label: '\u274c Cancel', callbackData: 'mpw:cancel' },
    ];

    return { text: lines.join('\n'), buttons };
  }

  // -----------------------------------------------------------------------
  // Callback handlers
  // -----------------------------------------------------------------------

  private handleDateSelect(
    state: MeetingProposalWizardState,
    chatId: number,
    dateStr: string,
  ): WizardResponse {
    // Validate date format and range
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return { text: 'Invalid date. Please select a valid date.' };
    }

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    if (date < now) {
      return { text: 'Date must be in the future.' };
    }

    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + MAX_PROPOSAL_DAYS_AHEAD);
    if (date > maxDate) {
      return { text: `Date must be within ${MAX_PROPOSAL_DAYS_AHEAD} days.` };
    }

    state.draft.date = dateStr;
    return this.advanceSection(state, chatId);
  }

  private handleTimeSelect(
    state: MeetingProposalWizardState,
    chatId: number,
    timeStr: string,
  ): WizardResponse {
    if (timeStr === 'custom') {
      state.awaitingTextInput = true;
      return {
        text: 'Please type the meeting time (e.g., 13:30):',
      };
    }

    if (!this.isValidTime(timeStr)) {
      return { text: 'Invalid time format. Use HH:MM (e.g., 14:30).' };
    }

    state.draft.time = timeStr;
    return this.advanceSection(state, chatId);
  }

  private handleCustomTimeText(
    state: MeetingProposalWizardState,
    chatId: number,
    text: string,
  ): WizardResponse {
    const trimmed = text.trim();
    if (!this.isValidTime(trimmed)) {
      state.awaitingTextInput = true;
      return { text: 'Invalid time format. Please use HH:MM (e.g., 14:30):' };
    }

    state.draft.time = trimmed;
    return this.advanceSection(state, chatId);
  }

  private handleLocationSelect(
    state: MeetingProposalWizardState,
    chatId: number,
    value: string,
  ): WizardResponse {
    if (value === 'custom') {
      state.awaitingTextInput = true;
      return {
        text: 'Please type the meeting location:',
      };
    }

    state.draft.location = value;
    return this.advanceSection(state, chatId);
  }

  private handleCustomLocationText(
    state: MeetingProposalWizardState,
    chatId: number,
    text: string,
  ): WizardResponse {
    const trimmed = text.trim();
    if (trimmed.length > MAX_LOCATION_LENGTH) {
      state.awaitingTextInput = true;
      return {
        text: `Location is too long (max ${MAX_LOCATION_LENGTH} characters). Please try again:`,
      };
    }

    state.draft.location = trimmed;
    return this.advanceSection(state, chatId);
  }

  private handleNotesSkip(
    state: MeetingProposalWizardState,
    chatId: number,
  ): WizardResponse {
    state.draft.notes = undefined;
    return this.advanceSection(state, chatId);
  }

  private handleNotesText(
    state: MeetingProposalWizardState,
    chatId: number,
    text: string,
  ): WizardResponse {
    const trimmed = text.trim();
    if (trimmed.length > MAX_NOTES_LENGTH) {
      state.awaitingTextInput = true;
      return {
        text: `Notes too long (max ${MAX_NOTES_LENGTH} characters). Please try again:`,
      };
    }

    state.draft.notes = trimmed;
    return this.advanceSection(state, chatId);
  }

  private handleSend(
    state: MeetingProposalWizardState,
    chatId: number,
  ): WizardResponse {
    const draft = state.draft;

    if (!draft.date || !draft.time) {
      return { text: 'Date and time are required.' };
    }

    this.states.delete(chatId);

    return {
      text: '\u2705 Proposal sent!',
      done: true,
      proposal: draft,
    };
  }

  private handleCancel(chatId: number): WizardResponse {
    this.states.delete(chatId);
    return { text: 'Meeting proposal cancelled.' };
  }

  private handleEdit(
    state: MeetingProposalWizardState,
    chatId: number,
    sectionStr: string,
  ): WizardResponse {
    const section =
      MeetingProposalWizardSection[
        sectionStr as keyof typeof MeetingProposalWizardSection
      ];
    if (!section || section === MeetingProposalWizardSection.CONFIRM) {
      return { text: 'Invalid section to edit.' };
    }

    state.section = section;
    state.editingFromConfirm = true;

    // For notes section, also expect text input
    if (section === MeetingProposalWizardSection.NOTES) {
      state.awaitingTextInput = true;
    }

    return this.buildSectionResponse(state);
  }

  // -----------------------------------------------------------------------
  // Navigation helpers
  // -----------------------------------------------------------------------

  private advanceSection(
    state: MeetingProposalWizardState,
    _chatId: number,
  ): WizardResponse {
    if (state.editingFromConfirm) {
      // Return to confirm after editing
      state.editingFromConfirm = false;
      state.section = MeetingProposalWizardSection.CONFIRM;
      return this.buildConfirmSection(state.draft);
    }

    const currentIdx = PROPOSAL_SECTION_ORDER.indexOf(state.section);
    const nextIdx = currentIdx + 1;

    if (nextIdx >= PROPOSAL_SECTION_ORDER.length) {
      state.section = MeetingProposalWizardSection.CONFIRM;
      return this.buildConfirmSection(state.draft);
    }

    const nextSection = PROPOSAL_SECTION_ORDER[nextIdx];

    // Notes section expects text input
    if (nextSection === MeetingProposalWizardSection.NOTES) {
      state.awaitingTextInput = true;
    }

    state.section = nextSection;
    return this.buildSectionResponse(state);
  }

  private buildSectionResponse(
    state: MeetingProposalWizardState,
  ): WizardResponse {
    switch (state.section) {
      case MeetingProposalWizardSection.DATE:
        return this.buildDateSection();
      case MeetingProposalWizardSection.TIME:
        return this.buildTimeSection();
      case MeetingProposalWizardSection.LOCATION:
        return this.buildLocationSection();
      case MeetingProposalWizardSection.NOTES:
        return this.buildNotesSection();
      case MeetingProposalWizardSection.CONFIRM:
        return this.buildConfirmSection(state.draft);
    }
  }

  // -----------------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------------

  private isValidTime(time: string): boolean {
    const match = /^(\d{1,2}):(\d{2})$/.exec(time);
    if (!match) return false;
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    return h >= 0 && h <= 23 && m >= 0 && m <= 59;
  }

  private formatDateISO(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private formatDateShort(d: Date): string {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
  }
}

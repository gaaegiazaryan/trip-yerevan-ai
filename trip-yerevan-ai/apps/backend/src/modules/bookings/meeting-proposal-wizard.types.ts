// =============================================================================
// Meeting Proposal Wizard — Types
// =============================================================================

export enum MeetingProposalWizardSection {
  DATE = 'DATE',
  TIME = 'TIME',
  LOCATION = 'LOCATION',
  NOTES = 'NOTES',
  CONFIRM = 'CONFIRM',
}

export const PROPOSAL_SECTION_ORDER: MeetingProposalWizardSection[] = [
  MeetingProposalWizardSection.DATE,
  MeetingProposalWizardSection.TIME,
  MeetingProposalWizardSection.LOCATION,
  MeetingProposalWizardSection.NOTES,
  MeetingProposalWizardSection.CONFIRM,
];

// =============================================================================
// Draft (in-memory state)
// =============================================================================

export interface MeetingProposalDraft {
  bookingId: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:MM
  location?: string;
  notes?: string;
}

// =============================================================================
// Wizard state (per chat)
// =============================================================================

export interface MeetingProposalWizardState {
  section: MeetingProposalWizardSection;
  draft: MeetingProposalDraft;
  bookingId: string;
  isCounterProposal: boolean;
  originalProposalId?: string;
  editingFromConfirm?: boolean;
  /** When true, wizard expects free-text input (custom time, location, notes) */
  awaitingTextInput?: boolean;
}

// =============================================================================
// Result types
// =============================================================================

export interface WizardResponse {
  text: string;
  buttons?: { label: string; callbackData: string }[];
  done?: boolean;
  proposal?: MeetingProposalDraft;
}

// =============================================================================
// Constants
// =============================================================================

export const TIME_PRESETS = [
  '09:00',
  '10:00',
  '11:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
];

export const LOCATION_PRESETS: { label: string; value: string }[] = [
  { label: 'Our Office', value: 'Our Office' },
  { label: 'Online / Zoom', value: 'Online / Zoom' },
];

export const MAX_PROPOSAL_DAYS_AHEAD = 60;
export const MAX_NOTES_LENGTH = 500;
export const MAX_LOCATION_LENGTH = 200;

export function createEmptyProposalDraft(bookingId: string): MeetingProposalDraft {
  return { bookingId };
}

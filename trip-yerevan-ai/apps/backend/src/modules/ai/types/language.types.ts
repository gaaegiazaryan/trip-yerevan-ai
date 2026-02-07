export type SupportedLanguage = 'RU' | 'AM' | 'EN';

export type TemplateKey =
  | 'greeting'
  | 'ask_destination'
  | 'ask_dates'
  | 'ask_travelers'
  | 'ask_budget'
  | 'ask_preferences'
  | 'ask_departure_city'
  | 'ask_trip_type'
  | 'ask_children_ages'
  | 'confirm_summary'
  | 'request_confirmed'
  | 'request_cancelled'
  | 'correction_prompt'
  | 'partial_date_clarify'
  | 'error_generic';

export type MessageTemplates = Record<TemplateKey, Record<SupportedLanguage, string>>;

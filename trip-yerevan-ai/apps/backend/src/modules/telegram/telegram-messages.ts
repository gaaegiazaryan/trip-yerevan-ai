import { SupportedLanguage } from '../ai/types';

type MessageKey =
  | 'welcome'
  | 'welcome_returning'
  | 'error_generic'
  | 'error_not_registered'
  | 'rate_limited';

// NOTE: AM translations use English as interim placeholders.
// Replace with native Armenian text provided by a human translator.
const MESSAGES: Record<MessageKey, Record<SupportedLanguage, string>> = {
  welcome: {
    RU:
      'Добро пожаловать в Trip Yerevan!\n\n' +
      'Я помогу вам найти лучшее предложение для путешествия. ' +
      'Просто напишите, куда и когда вы хотите поехать.\n\n' +
      'Например: _"Хочу в Дубай на двоих, 10-17 марта, бюджет до 2000$"_',
    AM:
      'Welcome to Trip Yerevan!\n\n' +
      'I will help you find the best travel deal. ' +
      'Just tell me where and when you want to travel.\n\n' +
      'For example: _"I want to go to Dubai for two, March 10-17, budget up to $2000"_',
    EN:
      'Welcome to Trip Yerevan!\n\n' +
      'I will help you find the best travel deal. ' +
      'Just tell me where and when you want to travel.\n\n' +
      'For example: _"I want to go to Dubai for two, March 10-17, budget up to $2000"_',
  },
  welcome_returning: {
    RU: 'С возвращением! Напишите, чем могу помочь.',
    AM: 'Welcome back! Tell me how I can help.',
    EN: 'Welcome back! Tell me how I can help.',
  },
  error_generic: {
    RU: 'Произошла ошибка. Попробуйте ещё раз через несколько секунд.',
    AM: 'An error occurred. Please try again in a few seconds.',
    EN: 'An error occurred. Please try again in a few seconds.',
  },
  error_not_registered: {
    RU: 'Пожалуйста, нажмите /start чтобы начать.',
    AM: 'Please press /start to begin.',
    EN: 'Please press /start to begin.',
  },
  rate_limited: {
    RU: 'Пожалуйста, не так быстро. Подождите несколько секунд.',
    AM: 'Please slow down. Wait a few seconds.',
    EN: 'Please slow down. Wait a few seconds.',
  },
};

export function getTelegramMessage(
  key: MessageKey,
  language: SupportedLanguage = 'RU',
): string {
  return MESSAGES[key][language];
}

export function prismaLanguageToSupported(
  lang: 'RU' | 'AM' | 'EN',
): SupportedLanguage {
  return lang;
}

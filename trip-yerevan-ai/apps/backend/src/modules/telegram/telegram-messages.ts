import { SupportedLanguage } from '../ai/types';

type MessageKey =
  | 'welcome'
  | 'welcome_returning'
  | 'error_generic'
  | 'error_not_registered'
  | 'rate_limited';

const MESSAGES: Record<MessageKey, Record<SupportedLanguage, string>> = {
  welcome: {
    RU:
      'Добро пожаловать в Trip Yerevan!\n\n' +
      'Я помогу вам найти лучшее предложение для путешествия. ' +
      'Просто напишите, куда и когда вы хотите поехать.\n\n' +
      'Например: _"Хочу в Дубай на двоих, 10-17 марта, бюджет до 2000$"_',
    AM:
      'Բարի գdelays Trip Yerevan!\n\n' +
      'Ես կdelays delays delays delays delays delays.\n\n' +
      'Օdelay: _"Ուdelay delay delay delay delay"_',
    EN:
      'Welcome to Trip Yerevan!\n\n' +
      'I will help you find the best travel deal. ' +
      'Just tell me where and when you want to travel.\n\n' +
      'For example: _"I want to go to Dubai for two, March 10-17, budget up to $2000"_',
  },
  welcome_returning: {
    RU: 'С возвращением! Напишите, чем могу помочь.',
    AM: 'Բარdelays delays! Delays delays delays.',
    EN: 'Welcome back! Tell me how I can help.',
  },
  error_generic: {
    RU: 'Произошла ошибка. Попробуйте ещё раз через несколько секунд.',
    AM: 'Delays delays delays. Delays delays delays delays.',
    EN: 'An error occurred. Please try again in a few seconds.',
  },
  error_not_registered: {
    RU: 'Пожалуйста, нажмите /start чтобы начать.',
    AM: 'Delays delays /start delays delays.',
    EN: 'Please press /start to begin.',
  },
  rate_limited: {
    RU: 'Пожалуйста, не так быстро. Подождите несколько секунд.',
    AM: 'Delays delays delays delays delays.',
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

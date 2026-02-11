import { SupportedLanguage } from '../ai/types';

type MessageKey =
  | 'welcome'
  | 'welcome_returning'
  | 'error_generic'
  | 'error_infrastructure'
  | 'error_not_registered'
  | 'rate_limited'
  | 'contact_manager';

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
  error_infrastructure: {
    RU: 'AI-сервис временно недоступен. Мы уже работаем над этим. Пожалуйста, попробуйте позже.',
    AM: 'AI service is temporarily unavailable. We are working on it. Please try again later.',
    EN: 'AI service is temporarily unavailable. We are working on it. Please try again later.',
  },
  error_not_registered: {
    RU: 'Пожалуйста, нажмите /start чтобы начать.',
    AM: 'Please press /start to begin.',
    EN: 'Please press /start to begin.',
  },
  rate_limited: {
    RU: '\u041f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, \u043d\u0435 \u0442\u0430\u043a \u0431\u044b\u0441\u0442\u0440\u043e. \u041f\u043e\u0434\u043e\u0436\u0434\u0438\u0442\u0435 \u043d\u0435\u0441\u043a\u043e\u043b\u044c\u043a\u043e \u0441\u0435\u043a\u0443\u043d\u0434.',
    AM: 'Please slow down. Wait a few seconds.',
    EN: 'Please slow down. Wait a few seconds.',
  },
  contact_manager: {
    RU: '\u0415\u0441\u043b\u0438 \u0443 \u0432\u0430\u0441 \u0435\u0441\u0442\u044c \u0432\u043e\u043f\u0440\u043e\u0441\u044b \u043f\u043e \u0442\u0443\u0440\u0443 \u2014 \u043d\u0430\u043f\u0438\u0448\u0438\u0442\u0435 \u043d\u0430\u0448\u0435\u043c\u0443 \u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440\u0443. \u041e\u043d \u043f\u043e\u043c\u043e\u0436\u0435\u0442 \u0441 \u0434\u0435\u0442\u0430\u043b\u044f\u043c\u0438, \u0431\u0440\u043e\u043d\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435\u043c \u0438 \u043e\u043f\u043b\u0430\u0442\u043e\u0439.',
    AM: 'If you have questions about the tour, write to our manager. They will help with details, booking and payment.',
    EN: 'If you have questions about the tour, write to our manager. They will help with details, booking and payment.',
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

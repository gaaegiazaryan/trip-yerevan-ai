import { SupportedLanguage } from '../ai/types';

type MessageKey =
  | 'welcome'
  | 'welcome_returning'
  | 'error_generic'
  | 'error_infrastructure'
  | 'error_not_registered'
  | 'rate_limited'
  | 'chat_header_traveler'
  | 'chat_header_agency'
  | 'chat_header_manager'
  | 'chat_exit'
  | 'chat_timeout'
  | 'chat_manager_requested';

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
  chat_header_traveler: {
    RU:
      '\ud83d\udcac *\u0420\u0435\u0436\u0438\u043c \u0447\u0430\u0442\u0430*\n\n' +
      '\u0410\u0433\u0435\u043d\u0442\u0441\u0442\u0432\u043e: {agencyName}\n' +
      '\u0421\u0442\u0430\u0442\u0443\u0441: \u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0439\n\n' +
      '\u041f\u0438\u0448\u0438\u0442\u0435 \u0432\u0430\u0448\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u043d\u0438\u0436\u0435.\n' +
      '\u041d\u0430\u0436\u043c\u0438\u0442\u0435 \u274c Exit chat \u0434\u043b\u044f \u0432\u044b\u0445\u043e\u0434\u0430.',
    AM:
      '\ud83d\udcac *Chat Mode*\n\n' +
      'Agency: {agencyName}\n' +
      'Status: Active\n\n' +
      'Type your message below.\n' +
      'Press \u274c Exit chat to leave.',
    EN:
      '\ud83d\udcac *Chat Mode*\n\n' +
      'Agency: {agencyName}\n' +
      'Status: Active\n\n' +
      'Type your message below.\n' +
      'Press \u274c Exit chat to leave.',
  },
  chat_header_agency: {
    RU:
      '\ud83d\udcac *\u0420\u0435\u0436\u0438\u043c \u0447\u0430\u0442\u0430*\n\n' +
      '\u041e\u0442\u0432\u0435\u0442 \u043f\u0443\u0442\u0435\u0448\u0435\u0441\u0442\u0432\u0435\u043d\u043d\u0438\u043a\u0443\n' +
      '\u0421\u0442\u0430\u0442\u0443\u0441: \u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0439\n\n' +
      '\u041f\u0438\u0448\u0438\u0442\u0435 \u0432\u0430\u0448\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u043d\u0438\u0436\u0435.\n' +
      '\u041d\u0430\u0436\u043c\u0438\u0442\u0435 \u274c Exit chat \u0434\u043b\u044f \u0432\u044b\u0445\u043e\u0434\u0430.',
    AM:
      '\ud83d\udcac *Chat Mode*\n\n' +
      'Replying to traveler\n' +
      'Status: Active\n\n' +
      'Type your message below.\n' +
      'Press \u274c Exit chat to leave.',
    EN:
      '\ud83d\udcac *Chat Mode*\n\n' +
      'Replying to traveler\n' +
      'Status: Active\n\n' +
      'Type your message below.\n' +
      'Press \u274c Exit chat to leave.',
  },
  chat_header_manager: {
    RU:
      '\ud83d\udcac *\u0420\u0435\u0436\u0438\u043c \u0447\u0430\u0442\u0430 (\u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440)*\n\n' +
      '\u041e\u0431\u0449\u0435\u043d\u0438\u0435 \u0441 \u043f\u0443\u0442\u0435\u0448\u0435\u0441\u0442\u0432\u0435\u043d\u043d\u0438\u043a\u043e\u043c\n' +
      '\u0421\u0442\u0430\u0442\u0443\u0441: \u0410\u043a\u0442\u0438\u0432\u043d\u044b\u0439\n\n' +
      '\u041f\u0438\u0448\u0438\u0442\u0435 \u0432\u0430\u0448\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435 \u043d\u0438\u0436\u0435.\n' +
      '\u041d\u0430\u0436\u043c\u0438\u0442\u0435 \u274c Exit chat \u0434\u043b\u044f \u0432\u044b\u0445\u043e\u0434\u0430.',
    AM:
      '\ud83d\udcac *Chat Mode (Manager)*\n\n' +
      'Chatting with traveler\n' +
      'Status: Active\n\n' +
      'Type your message below.\n' +
      'Press \u274c Exit chat to leave.',
    EN:
      '\ud83d\udcac *Chat Mode (Manager)*\n\n' +
      'Chatting with traveler\n' +
      'Status: Active\n\n' +
      'Type your message below.\n' +
      'Press \u274c Exit chat to leave.',
  },
  chat_exit: {
    RU: '\u0412\u044b \u0432\u044b\u0448\u043b\u0438 \u0438\u0437 \u0440\u0435\u0436\u0438\u043c\u0430 \u0447\u0430\u0442\u0430.',
    AM: 'You have exited chat mode.',
    EN: 'You have exited chat mode.',
  },
  chat_timeout: {
    RU:
      '\u23f0 \u0421\u0435\u0441\u0441\u0438\u044f \u0447\u0430\u0442\u0430 \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u0430 \u0438\u0437-\u0437\u0430 \u043d\u0435\u0430\u043a\u0442\u0438\u0432\u043d\u043e\u0441\u0442\u0438 (30 \u043c\u0438\u043d). ' +
      '\u0412\u044b \u043c\u043e\u0436\u0435\u0442\u0435 \u043d\u0430\u0447\u0430\u0442\u044c \u043d\u043e\u0432\u0443\u044e \u0441\u0435\u0441\u0441\u0438\u044e \u0438\u0437 \u043f\u0440\u0435\u0434\u043b\u043e\u0436\u0435\u043d\u0438\u044f.',
    AM: '\u23f0 Chat session ended due to inactivity (30 min). You can start a new session from the offer.',
    EN: '\u23f0 Chat session ended due to inactivity (30 min). You can start a new session from the offer.',
  },
  chat_manager_requested: {
    RU:
      '\ud83c\udd98 \u0417\u0430\u043f\u0440\u043e\u0441 \u043d\u0430 \u043f\u043e\u043c\u043e\u0449\u044c \u043c\u0435\u043d\u0435\u0434\u0436\u0435\u0440\u0430 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u0435\u043d. ' +
      '\u041c\u0435\u043d\u0435\u0434\u0436\u0435\u0440 \u0441\u0432\u044f\u0436\u0435\u0442\u0441\u044f \u0441 \u0432\u0430\u043c\u0438 \u0432 \u0431\u043b\u0438\u0436\u0430\u0439\u0448\u0435\u0435 \u0432\u0440\u0435\u043c\u044f.',
    AM: '\ud83c\udd98 Manager assistance request sent. A manager will contact you shortly.',
    EN: '\ud83c\udd98 Manager assistance request sent. A manager will contact you shortly.',
  },
};

export function getTelegramMessage(
  key: MessageKey,
  language: SupportedLanguage = 'RU',
): string {
  return MESSAGES[key][language];
}

export type ChatHeaderKey =
  | 'chat_header_traveler'
  | 'chat_header_agency'
  | 'chat_header_manager';

export function getChatHeaderMessage(
  key: ChatHeaderKey,
  language: SupportedLanguage,
  agencyName?: string,
): string {
  let text = MESSAGES[key][language];
  if (agencyName) {
    text = text.replace('{agencyName}', agencyName);
  }
  return text;
}

export function prismaLanguageToSupported(
  lang: 'RU' | 'AM' | 'EN',
): SupportedLanguage {
  return lang;
}

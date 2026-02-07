import { MessageTemplates } from '../types';

// NOTE: AM translations use English as interim placeholders.
// Replace with native Armenian text provided by a human translator.
export const TEMPLATES: MessageTemplates = {
  greeting: {
    RU: 'Привет! Я помогу вам спланировать поездку. Расскажите, куда и когда вы хотите поехать?',
    AM: "Hello! I'll help you plan your trip. Where and when would you like to travel?",
    EN: "Hello! I'll help you plan your trip. Where and when would you like to travel?",
  },
  ask_destination: {
    RU: 'Куда вы хотите поехать?',
    AM: 'Where would you like to travel?',
    EN: 'Where would you like to travel?',
  },
  ask_dates: {
    RU: 'Когда вы планируете поехать? Укажите даты или примерный период.',
    AM: 'When are you planning to travel? Please provide dates or an approximate period.',
    EN: 'When are you planning to travel? Please provide dates or an approximate period.',
  },
  ask_travelers: {
    RU: 'Сколько человек будет путешествовать? (взрослые, дети)',
    AM: 'How many people will be traveling? (adults, children)',
    EN: 'How many people will be traveling? (adults, children)',
  },
  ask_budget: {
    RU: 'Какой у вас бюджет на поездку?',
    AM: 'What is your budget for the trip?',
    EN: 'What is your budget for the trip?',
  },
  ask_preferences: {
    RU: 'Есть ли у вас особые пожелания? (all inclusive, прямой рейс и т.д.)',
    AM: 'Do you have any special preferences? (all inclusive, direct flight, etc.)',
    EN: 'Do you have any special preferences? (all inclusive, direct flight, etc.)',
  },
  ask_departure_city: {
    RU: 'Из какого города вы хотите вылететь?',
    AM: 'Which city would you like to depart from?',
    EN: 'Which city would you like to depart from?',
  },
  ask_trip_type: {
    RU: 'Какой тип поездки вас интересует? (пакетный тур, только перелёт, только отель, экскурсия)',
    AM: 'What type of trip are you interested in? (package tour, flight only, hotel only, excursion)',
    EN: 'What type of trip are you interested in? (package tour, flight only, hotel only, excursion)',
  },
  ask_children_ages: {
    RU: 'Сколько лет детям?',
    AM: 'How old are the children?',
    EN: 'How old are the children?',
  },
  confirm_summary: {
    RU: 'Всё верно? Могу отправить запрос турагентствам.',
    AM: 'Is everything correct? I can send the request to travel agencies.',
    EN: 'Is everything correct? I can send the request to travel agencies.',
  },
  request_confirmed: {
    RU: 'Ваша заявка отправлена! Турагентства получат ваш запрос и пришлют предложения.',
    AM: 'Your request has been submitted! Travel agencies will receive your request and send offers.',
    EN: 'Your request has been submitted! Travel agencies will receive your request and send offers.',
  },
  request_cancelled: {
    RU: 'Заявка отменена. Если захотите спланировать поездку — просто напишите мне.',
    AM: 'Request cancelled. If you want to plan a trip, just message me.',
    EN: 'Request cancelled. If you want to plan a trip, just message me.',
  },
  correction_prompt: {
    RU: 'Понял, что именно вы хотите изменить?',
    AM: 'Got it, what would you like to change?',
    EN: 'Got it, what would you like to change?',
  },
  partial_date_clarify: {
    RU: 'Вы упомянули {period}. Можете уточнить точные даты?',
    AM: 'You mentioned {period}. Could you provide exact dates?',
    EN: 'You mentioned {period}. Could you provide exact dates?',
  },
  error_generic: {
    RU: 'Извините, я не совсем понял. Можете переформулировать?',
    AM: "Sorry, I didn't quite understand. Could you rephrase that?",
    EN: "Sorry, I didn't quite understand. Could you rephrase that?",
  },
};

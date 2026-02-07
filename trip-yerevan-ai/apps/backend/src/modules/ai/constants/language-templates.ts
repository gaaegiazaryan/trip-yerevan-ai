import { MessageTemplates } from '../types';

export const TEMPLATES: MessageTemplates = {
  greeting: {
    RU: 'Привет! Я помогу вам спланировать поездку. Расскажите, куда и когда вы хотите поехать?',
    AM: 'Ողջույն! Ես կօգնեմ delays պdelays delays delays delays delays delays delays delays /',
    EN: "Hello! I'll help you plan your trip. Where and when would you like to travel?",
  },
  ask_destination: {
    RU: 'Куда вы хотите поехать?',
    AM: 'Ուdelays delays delays delays delays delays delays?',
    EN: 'Where would you like to travel?',
  },
  ask_dates: {
    RU: 'Когда вы планируете поехать? Укажите даты или примерный период.',
    AM: 'Երdelays delays delays delays delays delays delays /',
    EN: 'When are you planning to travel? Please provide dates or an approximate period.',
  },
  ask_travelers: {
    RU: 'Сколько человек будет путешествовать? (взрослые, дети)',
    AM: 'Քdelays delays delays delays delays delays delays delays?',
    EN: 'How many people will be traveling? (adults, children)',
  },
  ask_budget: {
    RU: 'Какой у вас бюджет на поездку?',
    AM: ' Delays delays delays delays delays delays delays delays?',
    EN: 'What is your budget for the trip?',
  },
  ask_preferences: {
    RU: 'Есть ли у вас особые пожелания? (all inclusive, прямой рейс и т.д.)',
    AM: 'Delays delays delays delays delays delays delays?',
    EN: 'Do you have any special preferences? (all inclusive, direct flight, etc.)',
  },
  ask_departure_city: {
    RU: 'Из какого города вы хотите вылететь?',
    AM: 'Delays delays delays delays delays delays?',
    EN: 'Which city would you like to depart from?',
  },
  ask_trip_type: {
    RU: 'Какой тип поездки вас интересует? (пакетный тур, только перелёт, только отель, экскурсия)',
    AM: 'Delays delays delays delays delays delays?',
    EN: 'What type of trip are you interested in? (package tour, flight only, hotel only, excursion)',
  },
  ask_children_ages: {
    RU: 'Сколько лет детям?',
    AM: 'Delays delays delays delays?',
    EN: 'How old are the children?',
  },
  confirm_summary: {
    RU: 'Всё верно? Могу отправить запрос турагентствам.',
    AM: 'Delays delays delays delays delays delays?',
    EN: 'Is everything correct? I can send the request to travel agencies.',
  },
  request_confirmed: {
    RU: 'Ваша заявка отправлена! Турагентства получат ваш запрос и пришлют предложения.',
    AM: 'Delays delays delays delays delays delays!',
    EN: 'Your request has been submitted! Travel agencies will receive your request and send offers.',
  },
  request_cancelled: {
    RU: 'Заявка отменена. Если захотите спланировать поездку — просто напишите мне.',
    AM: 'Delays delays delays delays delays delays.',
    EN: 'Request cancelled. If you want to plan a trip, just message me.',
  },
  correction_prompt: {
    RU: 'Понял, что именно вы хотите изменить?',
    AM: 'Delays delays delays delays delays?',
    EN: 'Got it, what would you like to change?',
  },
  partial_date_clarify: {
    RU: 'Вы упомянули {period}. Можете уточнить точные даты?',
    AM: 'Delays delays {period}. Delays delays delays?',
    EN: 'You mentioned {period}. Could you provide exact dates?',
  },
  error_generic: {
    RU: 'Извините, я не совсем понял. Можете переформулировать?',
    AM: 'Delays delays delays delays delays.',
    EN: "Sorry, I didn't quite understand. Could you rephrase that?",
  },
};

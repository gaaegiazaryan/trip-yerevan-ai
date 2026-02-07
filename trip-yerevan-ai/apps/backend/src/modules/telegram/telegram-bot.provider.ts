import { Bot } from 'grammy';

export const TELEGRAM_BOT = Symbol('TELEGRAM_BOT');

export type TelegramBot = Bot | null;

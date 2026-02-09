import { Bot } from 'grammy';
import { BotContext } from './telegram-context';

export const TELEGRAM_BOT = Symbol('TELEGRAM_BOT');

export type TelegramBot = Bot<BotContext> | null;

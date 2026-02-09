import { Context } from 'grammy';
import { User } from '@prisma/client';

/**
 * grammY context flavor that attaches the resolved database user.
 * Populated by TelegramUserMiddleware on every update that has `ctx.from`.
 * Updates without `ctx.from` (channel posts, etc.) will have `dbUser` undefined.
 */
export interface DbUserFlavor {
  dbUser: User | undefined;
}

/**
 * The custom context type used by the Trip Yerevan bot.
 * All handlers should use this type instead of bare `Context`.
 */
export type BotContext = Context & DbUserFlavor;

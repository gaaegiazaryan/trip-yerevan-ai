import { Injectable, Logger } from '@nestjs/common';
import { MiddlewareFn } from 'grammy';
import { UsersService } from '../users/users.service';
import { BotContext } from './telegram-context';

@Injectable()
export class TelegramUserMiddleware {
  private readonly logger = new Logger(TelegramUserMiddleware.name);

  constructor(private readonly usersService: UsersService) {}

  middleware(): MiddlewareFn<BotContext> {
    return async (ctx, next) => {
      ctx.dbUser = undefined;

      if (ctx.from) {
        try {
          ctx.dbUser = await this.usersService.upsertByTelegram({
            telegramId: BigInt(ctx.from.id),
            firstName: ctx.from.first_name,
            lastName: ctx.from.last_name,
            languageCode: ctx.from.language_code,
          });
        } catch (error) {
          this.logger.error(
            `Failed to upsert user telegramId=${ctx.from.id}: ${error}`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }

      await next();
    };
  }
}

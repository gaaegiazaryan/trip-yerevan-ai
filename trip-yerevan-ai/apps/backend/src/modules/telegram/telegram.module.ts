import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot } from 'grammy';
import { BotContext } from './telegram-context';
import { TelegramService } from './telegram.service';
import { TelegramUpdate } from './telegram.update';
import { TelegramRateLimiter } from './telegram-rate-limiter';
import { TelegramUserMiddleware } from './telegram-user.middleware';
import { TELEGRAM_BOT, TelegramBot } from './telegram-bot.provider';
import { UsersModule } from '../users/users.module';
import { AiModule } from '../ai/ai.module';
import { OffersModule } from '../offers/offers.module';
import { AgenciesModule } from '../agencies/agencies.module';

@Module({
  imports: [UsersModule, AiModule, OffersModule, AgenciesModule],
  providers: [
    {
      provide: TELEGRAM_BOT,
      useFactory: (config: ConfigService): TelegramBot => {
        const token = config.get<string>('TELEGRAM_BOT_TOKEN');
        if (!token) {
          return null;
        }
        return new Bot<BotContext>(token);
      },
      inject: [ConfigService],
    },
    TelegramRateLimiter,
    TelegramUserMiddleware,
    TelegramService,
    TelegramUpdate,
  ],
  exports: [TelegramService],
})
export class TelegramModule {}

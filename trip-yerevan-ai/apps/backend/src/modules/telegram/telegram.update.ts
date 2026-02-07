import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../infra/logger/logger.service';

@Injectable()
export class TelegramUpdate implements OnModuleInit {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit() {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');

    if (!token) {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN not set, bot will not start',
        TelegramUpdate.name,
      );
      return;
    }

    // TODO: initialize grammY Bot instance and register handlers
    this.logger.log('Telegram bot initialized', TelegramUpdate.name);
  }

  // Handler stubs — delegates to domain services, no business logic here

  async handleStart(_chatId: bigint, _telegramId: bigint): Promise<void> {
    // TODO: delegate to UsersService.findOrCreate
  }

  async handleMessage(
    _chatId: bigint,
    _telegramId: bigint,
    _text: string,
  ): Promise<void> {
    // TODO: delegate to AiService for conversation flow
  }
}

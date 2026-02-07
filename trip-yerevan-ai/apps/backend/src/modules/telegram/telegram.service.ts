import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../infra/logger/logger.service';

@Injectable()
export class TelegramService {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async sendMessage(chatId: bigint, text: string): Promise<void> {
    // TODO: implement with grammY Bot.api.sendMessage
    this.logger.log(
      `Sending message to ${chatId}: ${text.substring(0, 50)}...`,
      TelegramService.name,
    );
  }

  async sendOfferNotification(
    chatId: bigint,
    travelRequestId: string,
    offerCount: number,
  ): Promise<void> {
    // TODO: implement with inline keyboard for offer viewing
    this.logger.log(
      `Notifying ${chatId} about ${offerCount} offers for request ${travelRequestId}`,
      TelegramService.name,
    );
  }
}

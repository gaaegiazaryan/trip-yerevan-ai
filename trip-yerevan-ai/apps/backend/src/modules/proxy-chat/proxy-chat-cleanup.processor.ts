import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import { ProxyChatService } from './proxy-chat.service';
import { ChatAuditLogService, ChatAuditEvent } from './chat-audit-log.service';
import { TelegramService } from '../telegram/telegram.service';
import {
  PROXY_CHAT_QUEUE,
  INACTIVITY_DAYS,
  CLOSED_REASON_AUTO_INACTIVITY,
} from './proxy-chat.constants';

@Processor(PROXY_CHAT_QUEUE)
export class ProxyChatCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(ProxyChatCleanupProcessor.name);

  constructor(
    private readonly proxyChatService: ProxyChatService,
    private readonly chatAuditLog: ChatAuditLogService,
    @Inject(forwardRef(() => TelegramService))
    private readonly telegramService: TelegramService,
  ) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - INACTIVITY_DAYS);

    this.logger.log(
      `[proxy-chat-cleanup] Starting cleanup, inactivity cutoff: ${cutoff.toISOString()}`,
    );

    const inactiveChats = await this.proxyChatService.findInactiveChats(cutoff);

    let closed = 0;
    for (const chat of inactiveChats) {
      try {
        await this.proxyChatService.close(chat.id, CLOSED_REASON_AUTO_INACTIVITY);
        await this.chatAuditLog.log(
          chat.id,
          ChatAuditEvent.CHAT_AUTO_CLOSED,
          undefined,
          { inactivityDays: INACTIVITY_DAYS },
        );

        // Notify both parties with reopen button
        await this.notifyParticipants(chat.id);

        closed++;
      } catch (error) {
        this.logger.error(
          `[proxy-chat-cleanup] Failed to close chat ${chat.id}: ${error}`,
        );
      }
    }

    this.logger.log(
      `[proxy-chat-cleanup] Completed: ${closed}/${inactiveChats.length} chats closed`,
    );
  }

  private async notifyParticipants(proxyChatId: string): Promise<void> {
    const participants =
      await this.proxyChatService.getParticipantTelegramIds(proxyChatId);
    if (!participants) return;

    const reopenButton = [
      { label: '\ud83d\udd04 Reopen chat', callbackData: `chat:reopen:${proxyChatId}` },
    ];
    const closeText =
      '\ud83d\udd34 This chat has been automatically closed due to 7 days of inactivity.';

    // Notify traveler
    await this.telegramService
      .sendRfqToAgency(
        Number(participants.travelerTelegramId),
        closeText,
        reopenButton,
      )
      .catch((err) => {
        this.logger.error(
          `[proxy-chat-cleanup] Failed to notify traveler: ${err}`,
        );
      });

    // Notify agency agents
    for (const agentId of participants.agentTelegramIds) {
      await this.telegramService
        .sendRfqToAgency(Number(agentId), closeText, reopenButton)
        .catch((err) => {
          this.logger.error(
            `[proxy-chat-cleanup] Failed to notify agent: ${err}`,
          );
        });
    }
  }
}

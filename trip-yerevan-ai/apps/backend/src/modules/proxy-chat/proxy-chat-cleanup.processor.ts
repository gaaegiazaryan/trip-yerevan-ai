import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ProxyChatService } from './proxy-chat.service';
import { ChatAuditLogService, ChatAuditEvent } from './chat-audit-log.service';
import { PROXY_CHAT_QUEUE, INACTIVITY_DAYS } from './proxy-chat.constants';

@Processor(PROXY_CHAT_QUEUE)
export class ProxyChatCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(ProxyChatCleanupProcessor.name);

  constructor(
    private readonly proxyChatService: ProxyChatService,
    private readonly chatAuditLog: ChatAuditLogService,
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
        await this.proxyChatService.close(chat.id, 'auto_closed_inactivity');
        await this.chatAuditLog.log(
          chat.id,
          ChatAuditEvent.CHAT_AUTO_CLOSED,
          undefined,
          { inactivityDays: INACTIVITY_DAYS },
        );
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
}

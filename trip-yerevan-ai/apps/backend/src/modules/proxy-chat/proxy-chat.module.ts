import { Module, OnModuleInit, Logger, forwardRef } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ProxyChatService } from './proxy-chat.service';
import { ProxyChatSessionService } from './proxy-chat-session.service';
import { ContactLeakGuard } from './contact-leak-guard';
import { ChatPermissionService } from './chat-permission.service';
import { ChatAuditLogService } from './chat-audit-log.service';
import { ManagerTakeoverService } from './manager-takeover.service';
import { ProxyChatCleanupProcessor } from './proxy-chat-cleanup.processor';
import { ProxyChatController } from './proxy-chat.controller';
import { TelegramModule } from '../telegram/telegram.module';
import {
  PROXY_CHAT_QUEUE,
  PROXY_CHAT_CLEANUP_JOB,
} from './proxy-chat.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: PROXY_CHAT_QUEUE }),
    forwardRef(() => TelegramModule),
  ],
  controllers: [ProxyChatController],
  providers: [
    ProxyChatService,
    ProxyChatSessionService,
    ContactLeakGuard,
    ChatPermissionService,
    ChatAuditLogService,
    ManagerTakeoverService,
    ProxyChatCleanupProcessor,
  ],
  exports: [
    ProxyChatService,
    ProxyChatSessionService,
    ManagerTakeoverService,
    ChatAuditLogService,
  ],
})
export class ProxyChatModule implements OnModuleInit {
  private readonly logger = new Logger(ProxyChatModule.name);

  constructor(
    @InjectQueue(PROXY_CHAT_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    // Register hourly cleanup job (idempotent — removes existing if present)
    await this.queue.upsertJobScheduler(
      PROXY_CHAT_CLEANUP_JOB,
      { pattern: '0 * * * *' },
      { name: PROXY_CHAT_CLEANUP_JOB, data: {} },
    );
    this.logger.log('Registered proxy chat cleanup scheduler (hourly)');
  }
}

import { Module } from '@nestjs/common';
import { ProxyChatService } from './proxy-chat.service';
import { ProxyChatController } from './proxy-chat.controller';

@Module({
  controllers: [ProxyChatController],
  providers: [ProxyChatService],
  exports: [ProxyChatService],
})
export class ProxyChatModule {}

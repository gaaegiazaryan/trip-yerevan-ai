import { Controller, Get, Param } from '@nestjs/common';
import { ProxyChatService } from './proxy-chat.service';

@Controller('proxy-chats')
export class ProxyChatController {
  constructor(private readonly proxyChatService: ProxyChatService) {}

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.proxyChatService.findById(id);
  }
}

import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ProxyChatState, ChatChannel } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class ProxyChatQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(ProxyChatState)
  state?: ProxyChatState;

  @IsOptional()
  @IsEnum(ChatChannel)
  channel?: ChatChannel;

  @IsOptional()
  @IsUUID()
  travelRequestId?: string;
}

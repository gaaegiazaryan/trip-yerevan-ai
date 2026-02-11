import { IsEnum, IsOptional } from 'class-validator';
import { ProxyChatState, CloseReason } from '@prisma/client';

export class UpdateProxyChatStateDto {
  @IsEnum(ProxyChatState)
  state!: ProxyChatState;

  @IsOptional()
  @IsEnum(CloseReason)
  closeReason?: CloseReason;
}

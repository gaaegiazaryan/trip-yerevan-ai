import { IsUUID } from 'class-validator';

export class InviteAgentDto {
  @IsUUID()
  userId!: string;
}

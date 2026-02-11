import { IsString, IsEnum, IsOptional, MaxLength } from 'class-validator';
import { MessageContentType } from '@prisma/client';

export class SendMessageDto {
  @IsString()
  @MaxLength(4000)
  content!: string;

  @IsOptional()
  @IsEnum(MessageContentType)
  contentType?: MessageContentType;

  @IsOptional()
  @IsString()
  telegramFileId?: string;
}

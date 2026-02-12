import {
  IsEnum,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationCategory, NotificationChannel } from '@prisma/client';

export class NotificationPreferenceItemDto {
  @IsEnum(NotificationCategory)
  category!: NotificationCategory;

  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsBoolean()
  enabled!: boolean;
}

export class UpdateUserPreferencesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceItemDto)
  preferences!: NotificationPreferenceItemDto[];
}

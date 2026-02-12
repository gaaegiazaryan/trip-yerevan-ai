import {
  IsEnum,
  IsOptional,
  IsString,
  IsBoolean,
  IsArray,
  IsNotEmpty,
} from 'class-validator';
import {
  NotificationCategory,
  NotificationChannel,
  UserRole,
} from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class AdminPoliciesQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;
}

export class UpdatePolicyDto {
  @IsEnum(NotificationCategory)
  category!: NotificationCategory;

  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  allowedChannels!: NotificationChannel[];

  @IsBoolean()
  forceDeliver!: boolean;
}

export class AdminRoleDefaultsQueryDto {
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(NotificationCategory)
  category?: NotificationCategory;
}

export class UpdateRoleDefaultDto {
  @IsEnum(UserRole)
  role!: UserRole;

  @IsEnum(NotificationCategory)
  category!: NotificationCategory;

  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsBoolean()
  enabled!: boolean;
}

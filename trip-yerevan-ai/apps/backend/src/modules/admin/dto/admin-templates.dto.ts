import {
  IsEnum,
  IsOptional,
  IsString,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationChannel } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class AdminTemplatesQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  templateKey?: string;

  @IsOptional()
  @IsEnum(NotificationChannel)
  channel?: NotificationChannel;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isActive?: boolean;
}

class ButtonDto {
  @IsString()
  @IsNotEmpty()
  label!: string;

  @IsString()
  @IsNotEmpty()
  callbackData!: string;
}

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  templateKey!: string;

  @IsString()
  @IsNotEmpty()
  version!: string;

  @IsEnum(NotificationChannel)
  channel!: NotificationChannel;

  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ButtonDto)
  buttons?: ButtonDto[];

  @IsOptional()
  variables?: Record<string, string>;

  @IsOptional()
  @IsString()
  policyVersion?: string;
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  body?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ButtonDto)
  buttons?: ButtonDto[];

  @IsOptional()
  variables?: Record<string, string>;

  @IsOptional()
  @IsString()
  policyVersion?: string;
}

export class ActivateTemplateDto {
  @IsString()
  @IsNotEmpty()
  templateId!: string;
}

export class PreviewTemplateDto {
  @IsString()
  @IsNotEmpty()
  body!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ButtonDto)
  buttons?: ButtonDto[];

  @IsOptional()
  variables?: Record<string, string | number>;
}

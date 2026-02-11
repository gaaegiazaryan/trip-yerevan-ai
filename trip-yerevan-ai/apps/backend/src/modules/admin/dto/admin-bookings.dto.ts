import {
  IsEnum,
  IsOptional,
  IsString,
  IsDateString,
  IsObject,
  IsUUID,
  MaxLength,
  IsIn,
} from 'class-validator';
import { BookingStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class AdminBookingsQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class VerifyBookingDto {
  @IsIn(['CONFIRM', 'REJECT'])
  action!: 'CONFIRM' | 'REJECT';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsObject()
  checklist?: Record<string, boolean>;
}

export class KanbanQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;
}

export class AssignManagerDto {
  @IsUUID()
  managerId!: string;
}

export class SetStatusDto {
  @IsEnum(BookingStatus)
  status!: BookingStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class RescheduleProposalDto {
  @IsDateString()
  suggestedAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;
}

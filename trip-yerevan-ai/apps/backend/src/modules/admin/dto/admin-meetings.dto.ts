import {
  IsOptional,
  IsString,
  IsDateString,
  IsNumber,
  Min,
  MaxLength,
  IsEnum,
} from 'class-validator';
import { MeetingStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class AdminMeetingsQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(MeetingStatus)
  status?: MeetingStatus;

  @IsOptional()
  @IsDateString()
  date?: string;
}

export class CounterProposeMeetingDto {
  @IsDateString()
  dateTime!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  location?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CompleteMeetingDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  paymentMethod?: string;
}

export class CancelMeetingDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AdminCalendarQueryDto {
  @IsDateString()
  from!: string;

  @IsDateString()
  to!: string;

  @IsOptional()
  @IsUUID()
  managerId?: string;
}

export class RescheduleMeetingDto {
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

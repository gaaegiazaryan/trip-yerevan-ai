import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AgencyStatus } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class AdminAgenciesQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(AgencyStatus)
  status?: AgencyStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class VerifyAgencyDto {
  @IsIn(['APPROVE', 'REJECT', 'BLOCK'])
  action!: 'APPROVE' | 'REJECT' | 'BLOCK';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class TrustBadgeDto {
  @IsBoolean()
  enabled!: boolean;
}

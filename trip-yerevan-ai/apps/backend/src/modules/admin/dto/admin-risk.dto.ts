import { IsEnum, IsOptional } from 'class-validator';
import { RiskSeverity, RiskEntityType } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class AdminRiskEventsQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(RiskSeverity)
  severity?: RiskSeverity;

  @IsOptional()
  @IsEnum(RiskEntityType)
  entityType?: RiskEntityType;
}

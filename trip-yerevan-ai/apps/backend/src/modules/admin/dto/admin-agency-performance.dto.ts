import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class AgencyPerformanceQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class AgencyRankingQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(['winRate', 'revenue', 'offersSent', 'avgResponseTime'])
  sort?: 'winRate' | 'revenue' | 'offersSent' | 'avgResponseTime';
}

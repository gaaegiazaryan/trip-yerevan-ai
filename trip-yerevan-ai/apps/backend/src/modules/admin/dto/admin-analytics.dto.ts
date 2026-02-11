import { IsDateString, IsOptional } from 'class-validator';

export class AdminAnalyticsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

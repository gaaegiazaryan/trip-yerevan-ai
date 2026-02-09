import { IsEnum, IsOptional } from 'class-validator';
import { AgencyRole, AgencyMembershipStatus } from '@prisma/client';

export class UpdateMembershipDto {
  @IsOptional()
  @IsEnum(AgencyRole)
  role?: AgencyRole;

  @IsOptional()
  @IsEnum(AgencyMembershipStatus)
  status?: AgencyMembershipStatus;
}

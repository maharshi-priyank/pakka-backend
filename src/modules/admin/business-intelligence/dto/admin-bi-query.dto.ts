import { Type } from 'class-transformer';
import { Plan, SubscriptionStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class AdminBiQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(['all', 'razorpay', 'stripe'])
  provider?: 'all' | 'razorpay' | 'stripe' = 'all';

  @IsOptional()
  @IsString()
  @MaxLength(12)
  currency?: string;

  @IsOptional()
  @IsEnum(Plan)
  plan?: Plan;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  subscriptionStatus?: SubscriptionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  workspaceId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 50;
}

export class AdminBiExportQueryDto extends AdminBiQueryDto {
  @IsIn(['revenue', 'reconciliation', 'cohorts', 'invoice-aging'])
  report!: 'revenue' | 'reconciliation' | 'cohorts' | 'invoice-aging';
}

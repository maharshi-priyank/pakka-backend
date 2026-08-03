import { Plan, SubscriptionStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export type GrowthBucket = 'day' | 'week' | 'month' | 'auto';

export class AdminGrowthQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(['day', 'week', 'month', 'auto'])
  bucket?: GrowthBucket = 'auto';

  @IsOptional()
  @IsEnum(Plan)
  plan?: Plan;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  subscriptionStatus?: SubscriptionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  acquisitionSource?: string;

  @IsOptional()
  @IsIn(['all', 'razorpay', 'stripe'])
  provider?: 'all' | 'razorpay' | 'stripe' = 'all';

  @IsOptional()
  @IsString()
  @MaxLength(12)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  workspaceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  segment?: string;

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

export class AdminGrowthExportQueryDto extends AdminGrowthQueryDto {
  @IsIn(['overview', 'segments', 'funnel', 'cohorts', 'adoption'])
  report!: 'overview' | 'segments' | 'funnel' | 'cohorts' | 'adoption';
}

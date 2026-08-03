import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { Plan, SubscriptionStatus } from '@prisma/client';

export type AdminBulkAction =
  | 'workspace.archive'
  | 'workspace.restore'
  | 'workspace.feature_flag'
  | 'user.plan_override'
  | 'subscription.sync';

export class AdminBulkOperationDto {
  @IsIn(['workspace.archive', 'workspace.restore', 'workspace.feature_flag', 'user.plan_override', 'subscription.sync'])
  action!: AdminBulkAction;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  targetIds!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z][a-z0-9_.-]{1,63}$/)
  flag?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsEnum(Plan)
  plan?: Plan;

  @IsOptional()
  @IsDateString()
  planExpiresAt?: string;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  subscriptionStatus?: SubscriptionStatus;

  @IsOptional()
  @IsIn(['razorpay', 'stripe'])
  provider?: 'razorpay' | 'stripe';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

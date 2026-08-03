import { AdminCustomerTaskStatus, Plan, SubscriptionStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class AdminCustomerQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsIn(['NEW', 'ONBOARDING', 'ACTIVE', 'AT_RISK', 'PAST_DUE', 'CHURNED'])
  lifecycle?: CustomerLifecycle;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  healthMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  healthMax?: number;

  @IsOptional()
  @IsEnum(Plan)
  plan?: Plan;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  subscriptionStatus?: SubscriptionStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  inactiveDays?: number;

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

export class CreateCustomerTaskDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ownerAdminId?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class UpdateCustomerTaskDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ownerAdminId?: string;

  @IsOptional()
  @IsEnum(AdminCustomerTaskStatus)
  status?: AdminCustomerTaskStatus;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}

export class CreateCustomerTagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  tag!: string;
}

export type CustomerLifecycle = 'NEW' | 'ONBOARDING' | 'ACTIVE' | 'AT_RISK' | 'PAST_DUE' | 'CHURNED';

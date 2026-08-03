import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export type SupportQueueType = 'all' | 'onboarding' | 'billing' | 'inactive';

export class AdminSupportReportingQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(180)
  inactiveDays?: number = 30;
}

export class AdminSupportQueueQueryDto extends AdminSupportReportingQueryDto {
  @IsOptional()
  @IsIn(['all', 'onboarding', 'billing', 'inactive'])
  type?: SupportQueueType = 'all';

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

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

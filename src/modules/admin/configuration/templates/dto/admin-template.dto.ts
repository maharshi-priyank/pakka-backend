import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export type AdminTemplateType = 'email' | 'proposal' | 'contract' | 'invoice';

export class AdminTemplateQueryDto {
  @IsOptional()
  @IsIn(['email', 'proposal', 'contract', 'invoice'])
  type?: AdminTemplateType;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  workspaceId?: string;

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

export class AdminTemplateUpdateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  subject?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100000)
  bodyHtml?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

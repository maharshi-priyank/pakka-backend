import { AdminIncidentSeverity, AdminIncidentSource, AdminIncidentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class AdminOperationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(168)
  windowHours?: number = 24;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  workspaceId?: string;
}

export class AdminIncidentQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsEnum(AdminIncidentStatus)
  status?: AdminIncidentStatus;

  @IsOptional()
  @IsEnum(AdminIncidentSeverity)
  severity?: AdminIncidentSeverity;

  @IsOptional()
  @IsEnum(AdminIncidentSource)
  source?: AdminIncidentSource;

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

export class CreateAdminIncidentDto {
  @IsEnum(AdminIncidentSource)
  source!: AdminIncidentSource;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  service!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(240)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(AdminIncidentSeverity)
  severity?: AdminIncidentSeverity;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  workspaceId?: string;
}

export class AdminIncidentReasonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;
}

export class AssignIncidentDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  ownerAdminId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class IncidentCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;
}

export class IncidentRecoveryDto {
  @IsIn(['cancel_workflow', 'disable_automation', 'disable_workflow'])
  action!: 'cancel_workflow' | 'disable_automation' | 'disable_workflow';

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  targetId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;
}

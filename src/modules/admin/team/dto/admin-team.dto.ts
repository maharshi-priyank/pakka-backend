import { AdminRole, AdminUserStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEmail,
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

export class AdminTeamQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsEnum(AdminRole)
  role?: AdminRole;

  @IsOptional()
  @IsEnum(AdminUserStatus)
  status?: AdminUserStatus;

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

export class CreateAdminDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsEnum(AdminRole)
  role!: AdminRole;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  @IsOptional()
  @IsEnum(AdminUserStatus)
  status?: AdminUserStatus;
}

export class UpdateAdminRoleDto {
  @IsEnum(AdminRole)
  role!: AdminRole;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AdminReasonDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class ResetAdminPasswordDto {
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AdminSessionQueryDto {
  @IsOptional()
  @IsIn(['active', 'all'])
  scope?: 'active' | 'all' = 'active';
}

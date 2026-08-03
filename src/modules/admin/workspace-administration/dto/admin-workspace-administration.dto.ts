import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class AddWorkspaceMemberDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  userId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  roleId!: string;
}

export class UpdateWorkspaceMemberDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  roleId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RemoveWorkspaceMemberDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdateWorkspaceFeatureFlagDto {
  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class WorkspaceFeatureFlagParamDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z][a-z0-9_.-]{1,63}$/)
  flag!: string;
}

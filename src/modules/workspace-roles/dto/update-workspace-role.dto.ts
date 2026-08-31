import { IsOptional, IsString, IsNotEmpty, MaxLength } from 'class-validator'

export class UpdateWorkspaceRoleDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name?: string

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string
}

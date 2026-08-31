import { IsOptional, IsString, IsNotEmpty, MaxLength } from 'class-validator'

export class CreateWorkspaceRoleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string

  @IsOptional()
  @IsString()
  @MaxLength(240)
  description?: string

  @IsOptional()
  @IsString()
  copyFromRoleId?: string
}

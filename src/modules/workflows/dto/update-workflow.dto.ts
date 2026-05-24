import { IsString, IsOptional, IsBoolean } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class UpdateWorkflowDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Object)
  trigger?: Record<string, unknown>

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Object)
  steps?: Record<string, unknown>[]
}

import { IsBoolean, IsObject, IsOptional } from 'class-validator'

export class UpdateAutomationDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @IsOptional()
  @IsObject()
  actionConfig?: Record<string, unknown>
}

import { IsArray, IsEnum } from 'class-validator'
import { Permission } from '@prisma/client'

export class SetPermissionsDto {
  @IsArray()
  @IsEnum(Permission, { each: true })
  permissions: Permission[]
}

import { Controller, Get, Post, Patch, Put, Delete, Body, Param } from '@nestjs/common'
import { User } from '@prisma/client'
import { WorkspaceRolesService } from './workspace-roles.service'
import { CreateWorkspaceRoleDto } from './dto/create-workspace-role.dto'
import { UpdateWorkspaceRoleDto } from './dto/update-workspace-role.dto'
import { SetPermissionsDto } from './dto/set-permissions.dto'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'

@Controller('workspace-roles')
export class WorkspaceRolesController {
  constructor(private readonly workspaceRoles: WorkspaceRolesService) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.workspaceRoles.listRoles(user.activeWorkspaceId ?? user.id)
  }

  @Get(':id')
  getOne(@CurrentUser() user: User, @Param('id') id: string) {
    return this.workspaceRoles.getRole(user.activeWorkspaceId ?? user.id, id)
  }

  @Post()
  @RequirePermission('MANAGE_MEMBERS')
  create(@CurrentUser() user: User, @Body() dto: CreateWorkspaceRoleDto) {
    return this.workspaceRoles.createRole(user.activeWorkspaceId ?? user.id, dto)
  }

  @Patch(':id')
  @RequirePermission('MANAGE_MEMBERS')
  update(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: UpdateWorkspaceRoleDto) {
    return this.workspaceRoles.updateRole(user.activeWorkspaceId ?? user.id, id, dto)
  }

  @Delete(':id')
  @RequirePermission('MANAGE_MEMBERS')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.workspaceRoles.deleteRole(user.activeWorkspaceId ?? user.id, id)
  }

  @Put(':id/permissions')
  @RequirePermission('MANAGE_MEMBERS')
  setPermissions(@CurrentUser() user: User, @Param('id') id: string, @Body() dto: SetPermissionsDto) {
    return this.workspaceRoles.setPermissions(user.activeWorkspaceId ?? user.id, id, dto.permissions)
  }
}

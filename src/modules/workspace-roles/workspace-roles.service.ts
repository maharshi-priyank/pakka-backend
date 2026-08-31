import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common'
import { Permission } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateWorkspaceRoleDto } from './dto/create-workspace-role.dto'
import { UpdateWorkspaceRoleDto } from './dto/update-workspace-role.dto'

@Injectable()
export class WorkspaceRolesService {
  constructor(private readonly prisma: PrismaService) {}

  async listRoles(workspaceId: string) {
    return this.prisma.workspaceRole.findMany({
      where:   { OR: [{ workspaceId: null }, { workspaceId }] },
      include: { permissions: true, _count: { select: { members: true } } },
      orderBy: { sortOrder: 'asc' },
    })
  }

  async getRole(workspaceId: string, id: string) {
    const role = await this.findVisibleRole(workspaceId, id)
    return role
  }

  async createRole(workspaceId: string, dto: CreateWorkspaceRoleDto) {
    let permissions: Permission[] = []

    if (dto.copyFromRoleId) {
      // G6: only system roles or roles already scoped to this workspace can
      // be copied from — otherwise an owner could clone another workspace's
      // custom role by guessing/enumerating its id.
      const source = await this.findVisibleRole(workspaceId, dto.copyFromRoleId)
      permissions = source.permissions.map(p => p.permission)
    }

    return this.prisma.workspaceRole.create({
      data: {
        workspaceId,
        key:         `CUSTOM_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`.toUpperCase(),
        name:        dto.name,
        description: dto.description,
        isSystem:    false,
        permissions: { create: permissions.map(permission => ({ permission })) },
      },
      include: { permissions: true, _count: { select: { members: true } } },
    })
  }

  async updateRole(workspaceId: string, id: string, dto: UpdateWorkspaceRoleDto) {
    const role = await this.findVisibleRole(workspaceId, id)
    if (role.isSystem) throw new ForbiddenException('System roles cannot be edited.')

    return this.prisma.workspaceRole.update({
      where: { id },
      data:  { name: dto.name, description: dto.description },
      include: { permissions: true, _count: { select: { members: true } } },
    })
  }

  async deleteRole(workspaceId: string, id: string) {
    const role = await this.findVisibleRole(workspaceId, id)
    if (role.isSystem) throw new ForbiddenException('System roles cannot be deleted.')

    const memberCount = await this.prisma.workspaceMember.count({ where: { workspaceRoleId: id } })
    if (memberCount > 0) {
      throw new BadRequestException(`${memberCount} member(s) are assigned this role. Reassign them before deleting it.`)
    }

    await this.prisma.workspaceRole.delete({ where: { id } })
    return { message: 'Role deleted.' }
  }

  async setPermissions(workspaceId: string, id: string, permissions: Permission[]) {
    const role = await this.findVisibleRole(workspaceId, id)
    if (role.isSystem) throw new ForbiddenException('System roles cannot be edited.')

    await this.prisma.$transaction([
      this.prisma.workspaceRolePermission.deleteMany({ where: { roleId: id } }),
      this.prisma.workspaceRolePermission.createMany({
        data: permissions.map(permission => ({ roleId: id, permission })),
      }),
    ])

    return this.prisma.workspaceRole.findUnique({
      where:   { id },
      include: { permissions: true, _count: { select: { members: true } } },
    })
  }

  /**
   * Visible = system role (workspaceId null) or scoped to this workspace.
   * Cross-tenant roles 404; system roles are visible but write paths must
   * separately check `isSystem` and reject with 403.
   */
  private async findVisibleRole(workspaceId: string, id: string) {
    const role = await this.prisma.workspaceRole.findUnique({
      where:   { id },
      include: { permissions: true },
    })
    if (!role || (role.workspaceId !== null && role.workspaceId !== workspaceId)) {
      throw new NotFoundException('Role not found.')
    }
    return role
  }
}

import { Injectable, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class PermissionsService implements OnModuleInit {
  private systemRolePermissions = new Map<string, Set<string>>()

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const roles = await this.prisma.workspaceRole.findMany({
      where:   { isSystem: true },
      include: { permissions: true },
    })
    for (const role of roles) {
      this.systemRolePermissions.set(
        role.key,
        new Set(role.permissions.map(p => p.permission as string)),
      )
    }
  }

  async hasPermission(userId: string, workspaceId: string, permission: string): Promise<boolean> {
    const membership = await this.prisma.workspaceMember.findUnique({
      where:   { userId_workspaceId: { userId, workspaceId } },
      include: { workspaceRole: true },
    })
    if (!membership) return false

    const cached = this.systemRolePermissions.get(membership.workspaceRole.key)
    if (cached) return cached.has(permission)

    const perm = await this.prisma.workspaceRolePermission.findUnique({
      where: { roleId_permission: { roleId: membership.workspaceRoleId, permission: permission as any } },
    })
    return !!perm
  }

  async getPermissions(userId: string, workspaceId: string): Promise<string[]> {
    const membership = await this.prisma.workspaceMember.findUnique({
      where:   { userId_workspaceId: { userId, workspaceId } },
      include: { workspaceRole: true },
    })
    if (!membership) return []

    const cached = this.systemRolePermissions.get(membership.workspaceRole.key)
    if (cached) return [...cached]

    const perms = await this.prisma.workspaceRolePermission.findMany({
      where: { roleId: membership.workspaceRoleId },
    })
    return perms.map(p => p.permission as string)
  }

  async listRoles() {
    return this.prisma.workspaceRole.findMany({
      orderBy: { sortOrder: 'asc' },
    })
  }
}

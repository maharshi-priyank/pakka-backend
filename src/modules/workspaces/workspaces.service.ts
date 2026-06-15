import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { nanoid } from 'nanoid'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateWorkspaceDto } from './dto/create-workspace.dto'
import { UpdateWorkspaceDto } from './dto/update-workspace.dto'
import { PermissionsService } from '../permissions/permissions.service'

const WORKSPACE_LIMITS: Record<string, number> = {
  FREE:   1,
  SOLO:   2,
  STUDIO: 5,
}

// Ordered lowest → highest. Last entry = top plan (no upgrade path exists above it).
const PLAN_ORDER = ['FREE', 'SOLO', 'STUDIO'] as const
const isTopPlan = (plan: string) => plan === PLAN_ORDER[PLAN_ORDER.length - 1]

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  async create(userId: string, userPlan: string, dto: CreateWorkspaceDto) {
    const limit = WORKSPACE_LIMITS[userPlan] ?? 1
    const owned = await this.prisma.workspaceMember.count({
      where: { userId, role: 'OWNER' },
    })
    if (owned >= limit) {
      const msg = isTopPlan(userPlan)
        ? `You've reached the workspace limit for the Studio plan (${limit}). This is the current maximum.`
        : `Your ${userPlan} plan allows up to ${limit} workspace${limit === 1 ? '' : 's'}. Upgrade to add more.`
      throw new ForbiddenException(msg)
    }

    const id = nanoid(21)
    await this.prisma.$transaction([
      this.prisma.workspace.create({ data: { id, name: dto.name } }),
      this.prisma.workspaceMember.create({ data: { user: { connect: { id: userId } }, workspace: { connect: { id } }, role: 'OWNER', workspaceRole: { connect: { key: 'OWNER' } } } }),
      this.prisma.user.update({ where: { id: userId }, data: { activeWorkspaceId: id } }),
    ])
    return { id, name: dto.name }
  }

  async listForUser(userId: string) {
    const memberships = await this.prisma.workspaceMember.findMany({
      where:   { userId },
      include: { workspace: true, workspaceRole: true },
      orderBy: { joinedAt: 'asc' },
    })
    return memberships.map(m => ({
      ...m.workspace,
      role:     m.workspaceRole.key,
      roleId:   m.workspaceRoleId,
      roleName: m.workspaceRole.name,
    }))
  }

  async switchActive(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    })
    if (!membership) throw new NotFoundException('You are not a member of this workspace.')

    await this.prisma.user.update({
      where: { id: userId },
      data:  { activeWorkspaceId: workspaceId },
    })
    return { activeWorkspaceId: workspaceId }
  }

  async updateProfile(userId: string, workspaceId: string, dto: UpdateWorkspaceDto) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    })
    if (!membership) throw new NotFoundException('Workspace not found.')
    if (membership.role !== 'OWNER') throw new ForbiddenException('Only the workspace owner can update profile.')

    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data:  dto,
    })
  }

  async getOne(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where:   { userId_workspaceId: { userId, workspaceId } },
      include: { workspace: true },
    })
    if (!membership) throw new NotFoundException('Workspace not found.')
    return { ...membership.workspace, role: membership.role }
  }

  async getRoles() {
    return this.permissionsService.listRoles()
  }

  async getMyPermissions(userId: string, workspaceId: string) {
    return this.permissionsService.getPermissions(userId, workspaceId)
  }
}

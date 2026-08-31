import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { nanoid } from 'nanoid'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateWorkspaceDto } from './dto/create-workspace.dto'
import { UpdateWorkspaceDto } from './dto/update-workspace.dto'
import { PermissionsService } from '../permissions/permissions.service'
import { PRESET_ROLES } from './workspace-role-presets'

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
      where: { userId, workspaceRole: { key: 'OWNER' } },
    })
    if (owned >= limit) {
      const msg = isTopPlan(userPlan)
        ? `You've reached the workspace limit for the Studio plan (${limit}). This is the current maximum.`
        : `Your ${userPlan} plan allows up to ${limit} workspace${limit === 1 ? '' : 's'}. Upgrade to add more.`
      throw new ForbiddenException(msg)
    }

    const ownerRole = await this.prisma.workspaceRole.findFirst({ where: { key: 'OWNER', workspaceId: null } })
    if (!ownerRole) throw new NotFoundException('OWNER system role is not seeded.')

    const id = nanoid(21)
    await this.prisma.$transaction([
      this.prisma.workspace.create({ data: { id, name: dto.name } }),
      this.prisma.workspaceMember.create({
        data: { user: { connect: { id: userId } }, workspace: { connect: { id } }, workspaceRole: { connect: { id: ownerRole.id } } },
      }),
      this.prisma.user.update({ where: { id: userId }, data: { activeWorkspaceId: id } }),
    ])

    // KTD-3: presets are seeded only for Studio workspaces — Free/Solo
    // workspaces don't allow team members, so there's nothing to assign a
    // preset to.
    if (userPlan === 'STUDIO') {
      await this.seedPresetsForWorkspace(id)
    }

    return { id, name: dto.name }
  }

  // Idempotent — safe to call on workspace creation (G2: also called from
  // PaymentsService.onActivated() when an owner upgrades to Studio, and from
  // the backfill migration for pre-existing Studio workspaces).
  async seedPresetsForWorkspace(workspaceId: string): Promise<void> {
    const existing = await this.prisma.workspaceRole.findMany({
      where:  { workspaceId, key: { in: PRESET_ROLES.map(p => p.key) } },
      select: { key: true },
    })
    const existingKeys = new Set(existing.map(r => r.key))
    const toCreate = PRESET_ROLES.filter(p => !existingKeys.has(p.key))
    if (toCreate.length === 0) return

    const operations: Prisma.PrismaPromise<unknown>[] = toCreate.map(preset =>
      this.prisma.workspaceRole.create({
        data: {
          workspaceId,
          key:         preset.key,
          name:        preset.name,
          description: preset.description,
          isSystem:    false,
          permissions: { create: preset.permissions.map(permission => ({ permission })) },
        },
      }),
    )
    await this.prisma.$transaction(operations)
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
    // Membership-scoping only — the caller must have MANAGE_WORKSPACE_SETTINGS
    // (enforced by WorkspacePermissionGuard on the controller endpoint, which
    // system OWNER and ADMIN roles both hold). No additional OWNER-only gate
    // here so an ADMIN with that permission isn't blocked (M12).
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
    })
    if (!membership) throw new NotFoundException('Workspace not found.')

    return this.prisma.workspace.update({
      where: { id: workspaceId },
      data:  dto,
    })
  }

  async getOne(userId: string, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findUnique({
      where:   { userId_workspaceId: { userId, workspaceId } },
      include: { workspace: true, workspaceRole: true },
    })
    if (!membership) throw new NotFoundException('Workspace not found.')
    return { ...membership.workspace, role: membership.workspaceRole.key }
  }

  async getRoles(workspaceId: string | null) {
    return this.permissionsService.listRoles(workspaceId)
  }

  async getMyPermissions(userId: string, workspaceId: string) {
    return this.permissionsService.getPermissions(userId, workspaceId)
  }
}

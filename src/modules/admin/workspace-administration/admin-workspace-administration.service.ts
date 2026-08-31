import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type {
  AddWorkspaceMemberDto,
  RemoveWorkspaceMemberDto,
  UpdateWorkspaceFeatureFlagDto,
  UpdateWorkspaceMemberDto,
} from './dto/admin-workspace-administration.dto';

@Injectable()
export class AdminWorkspaceAdministrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listMembers(workspaceId: string) {
    await this.assertWorkspace(workspaceId);
    const [members, roles] = await Promise.all([
      this.prisma.workspaceMember.findMany({
        where: { workspaceId },
        include: {
          user: { select: { id: true, name: true, email: true, createdAt: true } },
          workspaceRole: { select: { id: true, key: true, name: true } },
        },
        orderBy: { joinedAt: 'asc' },
      }),
      this.prisma.workspaceRole.findMany({
        where:   { OR: [{ workspaceId: null }, { workspaceId }] },
        select:  { id: true, key: true, name: true },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);
    return {
      items: members.map((member) => this.serializeMember(member)),
      roles,
    };
  }

  async addMember(adminId: string, adminRole: AdminRole, workspaceId: string, dto: AddWorkspaceMemberDto) {
    await this.assertWorkspace(workspaceId);
    const [user, role, existing] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: dto.userId }, select: { id: true, name: true, email: true } }),
      this.prisma.workspaceRole.findUnique({ where: { id: dto.roleId }, select: { id: true, key: true, name: true } }),
      this.prisma.workspaceMember.findUnique({ where: { userId_workspaceId: { userId: dto.userId, workspaceId } }, select: { id: true } }),
    ]);
    if (!user) throw new NotFoundException('User not found.');
    if (!role) throw new NotFoundException('Workspace role not found.');
    if (role.key === 'OWNER') throw new BadRequestException('OWNER cannot be assigned to a new member.');
    if (existing) throw new ConflictException('User is already a workspace member.');

    const member = await this.prisma.workspaceMember.create({
      data: { userId: user.id, workspaceId, workspaceRoleId: role.id },
      include: { user: { select: { id: true, name: true, email: true, createdAt: true } }, workspaceRole: { select: { id: true, key: true, name: true } } },
    });
    await this.audit.log({
      adminId,
      adminRole,
      targetType: 'workspace',
      targetId: workspaceId,
      action: 'admin.workspace.member.add',
      after: { userId: user.id, roleId: role.id, roleKey: role.key },
    });
    return this.serializeMember(member);
  }

  async updateMember(adminId: string, adminRole: AdminRole, workspaceId: string, userId: string, dto: UpdateWorkspaceMemberDto) {
    const member = await this.getMember(workspaceId, userId);
    if (member.workspaceRole.key === 'OWNER' || member.role === 'OWNER') {
      throw new BadRequestException('The workspace owner cannot be downgraded.');
    }
    const role = await this.prisma.workspaceRole.findUnique({ where: { id: dto.roleId }, select: { id: true, key: true, name: true } });
    if (!role) throw new NotFoundException('Workspace role not found.');
    if (role.key === 'OWNER') throw new BadRequestException('OWNER cannot be assigned to a team member.');

    const updated = await this.prisma.workspaceMember.update({
      where: { userId_workspaceId: { userId, workspaceId } },
      data: { workspaceRoleId: role.id },
      include: { user: { select: { id: true, name: true, email: true, createdAt: true } }, workspaceRole: { select: { id: true, key: true, name: true } } },
    });
    await this.audit.log({
      adminId,
      adminRole,
      targetType: 'workspace',
      targetId: workspaceId,
      action: 'admin.workspace.member.role',
      before: { userId, roleId: member.workspaceRole.id, roleKey: member.workspaceRole.key },
      after: { userId, roleId: role.id, roleKey: role.key },
      reason: dto.reason ?? null,
    });
    return this.serializeMember(updated);
  }

  async removeMember(adminId: string, adminRole: AdminRole, workspaceId: string, userId: string, dto: RemoveWorkspaceMemberDto) {
    const member = await this.getMember(workspaceId, userId);
    if (member.workspaceRole.key === 'OWNER' || member.role === 'OWNER') {
      throw new BadRequestException('The workspace owner cannot be removed.');
    }
    await this.prisma.$transaction([
      this.prisma.workspaceMember.delete({ where: { userId_workspaceId: { userId, workspaceId } } }),
      this.prisma.user.updateMany({ where: { id: userId, activeWorkspaceId: workspaceId }, data: { activeWorkspaceId: null } }),
    ]);
    await this.audit.log({
      adminId,
      adminRole,
      targetType: 'workspace',
      targetId: workspaceId,
      action: 'admin.workspace.member.remove',
      before: { userId, roleId: member.workspaceRole.id, roleKey: member.workspaceRole.key },
      after: { removed: true },
      reason: dto.reason ?? null,
    });
    return { removed: true, userId, workspaceId };
  }

  async listFeatureFlags(workspaceId: string) {
    await this.assertWorkspace(workspaceId);
    return this.prisma.adminWorkspaceFeatureFlag.findMany({
      where: { workspaceId },
      orderBy: { flag: 'asc' },
      select: { id: true, workspaceId: true, flag: true, enabled: true, updatedBy: true, createdAt: true, updatedAt: true },
    });
  }

  async updateFeatureFlag(adminId: string, adminRole: AdminRole, workspaceId: string, flag: string, dto: UpdateWorkspaceFeatureFlagDto) {
    await this.assertWorkspace(workspaceId);
    const before = await this.prisma.adminWorkspaceFeatureFlag.findUnique({ where: { workspaceId_flag: { workspaceId, flag } } });
    const after = await this.prisma.adminWorkspaceFeatureFlag.upsert({
      where: { workspaceId_flag: { workspaceId, flag } },
      create: { workspaceId, flag, enabled: dto.enabled, updatedBy: adminId },
      update: { enabled: dto.enabled, updatedBy: adminId },
      select: { id: true, workspaceId: true, flag: true, enabled: true, updatedBy: true, createdAt: true, updatedAt: true },
    });
    await this.audit.log({
      adminId,
      adminRole,
      targetType: 'workspace',
      targetId: workspaceId,
      action: 'admin.feature_flag.toggle',
      before: before ? { flag, enabled: before.enabled } : { flag, exists: false, enabled: false },
      after: { flag, enabled: after.enabled },
      reason: dto.reason ?? null,
    });
    return after;
  }

  private async assertWorkspace(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } });
    if (!workspace) throw new NotFoundException('Workspace not found.');
  }

  private async getMember(workspaceId: string, userId: string) {
    const member = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      include: { user: { select: { id: true, name: true, email: true, createdAt: true } }, workspaceRole: { select: { id: true, key: true, name: true } } },
    });
    if (!member) throw new NotFoundException('Workspace member not found.');
    return member;
  }

  private serializeMember(member: {
    id: string;
    userId: string;
    workspaceId: string;
    role: string;
    joinedAt: Date;
    user: { id: string; name: string; email: string; createdAt: Date };
    workspaceRole: { id: string; key: string; name: string };
  }) {
    return {
      membershipId: member.id,
      userId: member.user.id,
      name: member.user.name,
      email: member.user.email,
      userCreatedAt: member.user.createdAt,
      workspaceId: member.workspaceId,
      legacyRole: member.role,
      roleId: member.workspaceRole.id,
      roleKey: member.workspaceRole.key,
      roleName: member.workspaceRole.name,
      joinedAt: member.joinedAt,
      owner: member.workspaceRole.key === 'OWNER' || member.role === 'OWNER',
    };
  }
}

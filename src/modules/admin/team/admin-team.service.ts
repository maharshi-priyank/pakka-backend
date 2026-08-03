import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdminRole, AdminUserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type {
  AdminReasonDto,
  AdminTeamQueryDto,
  CreateAdminDto,
  ResetAdminPasswordDto,
  UpdateAdminRoleDto,
} from './dto/admin-team.dto';

@Injectable()
export class AdminTeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: AdminTeamQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const q = query.q?.trim();
    const where = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' as const } },
              { name: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.adminUser.findMany({
        where,
        orderBy: [{ status: 'asc' }, { email: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: this.listSelect(),
      }),
      this.prisma.adminUser.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async detail(id: string) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id },
      select: {
        ...this.listSelect(),
        suspendedAt: true,
        suspendedById: true,
        suspensionReason: true,
        failedLoginCount: true,
        lockedUntil: true,
        mustChangePassword: true,
        sessions: {
          where: { revokedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { lastSeenAt: 'desc' },
          take: 20,
          select: this.sessionSelect(),
        },
        _count: { select: { sessions: true, ownedIncidents: true, customerTasks: true } },
      },
    });
    if (!admin) throw new NotFoundException('Admin account not found.');
    return admin;
  }

  async create(actorId: string, actorRole: AdminRole, dto: CreateAdminDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.adminUser.findUnique({ where: { email }, select: { id: true } });
    if (existing) throw new ConflictException('An admin with this email already exists.');
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const status = dto.status ?? AdminUserStatus.ACTIVE;
    const admin = await this.prisma.adminUser.create({
      data: {
        email,
        name: dto.name?.trim() || null,
        role: dto.role,
        status,
        passwordHash,
        mustChangePassword: status === AdminUserStatus.INVITED,
      },
      select: this.listSelect(),
    });
    await this.audit.log({
      adminId: actorId,
      adminRole: actorRole,
      targetType: 'admin',
      targetId: admin.id,
      action: 'admin.team.create',
      after: this.auditSafe(admin),
    });
    return admin;
  }

  async updateRole(actorId: string, actorRole: AdminRole, id: string, dto: UpdateAdminRoleDto) {
    const target = await this.requireAdmin(id);
    if (target.role === dto.role) return this.publicAdmin(target);
    if (target.role === AdminRole.SUPERADMIN && dto.role !== AdminRole.SUPERADMIN) {
      await this.assertNotLastActiveSuperadmin(id);
    }
    const updated = await this.prisma.adminUser.update({
      where: { id },
      data: { role: dto.role },
      select: this.listSelect(),
    });
    await this.audit.log({
      adminId: actorId,
      adminRole: actorRole,
      targetType: 'admin',
      targetId: id,
      action: 'admin.team.role.update',
      before: { role: target.role },
      after: { role: updated.role },
      reason: dto.reason ?? null,
    });
    return updated;
  }

  async suspend(actorId: string, actorRole: AdminRole, id: string, dto: AdminReasonDto) {
    if (actorId === id) throw new BadRequestException('You cannot suspend your own admin account.');
    const target = await this.requireAdmin(id);
    if (target.status === AdminUserStatus.SUSPENDED) return this.publicAdmin(target);
    if (target.role === AdminRole.SUPERADMIN) await this.assertNotLastActiveSuperadmin(id);
    const updated = await this.prisma.adminUser.update({
      where: { id },
      data: {
        status: AdminUserStatus.SUSPENDED,
        suspendedAt: new Date(),
        suspendedById: actorId,
        suspensionReason: dto.reason.trim(),
      },
      select: this.listSelect(),
    });
    await this.revokeSessions(id, `account suspended: ${dto.reason.trim()}`);
    await this.audit.log({
      adminId: actorId,
      adminRole: actorRole,
      targetType: 'admin',
      targetId: id,
      action: 'admin.team.suspend',
      before: this.auditSafe(target),
      after: this.auditSafe(updated),
      reason: dto.reason.trim(),
    });
    return updated;
  }

  async reactivate(actorId: string, actorRole: AdminRole, id: string, dto: AdminReasonDto) {
    const target = await this.requireAdmin(id);
    const updated = await this.prisma.adminUser.update({
      where: { id },
      data: {
        status: AdminUserStatus.ACTIVE,
        suspendedAt: null,
        suspendedById: null,
        suspensionReason: null,
        failedLoginCount: 0,
        lockedUntil: null,
      },
      select: this.listSelect(),
    });
    await this.audit.log({
      adminId: actorId,
      adminRole: actorRole,
      targetType: 'admin',
      targetId: id,
      action: 'admin.team.reactivate',
      before: this.auditSafe(target),
      after: this.auditSafe(updated),
      reason: dto.reason.trim(),
    });
    return updated;
  }

  async resetPassword(actorId: string, actorRole: AdminRole, id: string, dto: ResetAdminPasswordDto) {
    const target = await this.requireAdmin(id);
    const passwordHash = await bcrypt.hash(dto.password, 12);
    await this.prisma.adminUser.update({
      where: { id },
      data: { passwordHash, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
    });
    await this.revokeSessions(id, 'password reset');
    await this.audit.log({
      adminId: actorId,
      adminRole: actorRole,
      targetType: 'admin',
      targetId: id,
      action: 'admin.team.password.reset',
      before: { email: target.email, mustChangePassword: target.mustChangePassword },
      after: { email: target.email, mustChangePassword: true },
      reason: dto.reason ?? null,
    });
    return { id, reset: true, sessionsRevoked: true };
  }

  async sessions(id: string, scope: 'active' | 'all' = 'active') {
    await this.requireAdmin(id);
    const sessions = await this.prisma.adminSession.findMany({
      where: { adminId: id, ...(scope === 'active' ? { revokedAt: null, expiresAt: { gt: new Date() } } : {}) },
      orderBy: { lastSeenAt: 'desc' },
      take: 100,
      select: this.sessionSelect(),
    });
    return { items: sessions, total: sessions.length };
  }

  async revokeSession(actorId: string, actorRole: AdminRole, id: string, sessionId: string, dto: AdminReasonDto) {
    await this.requireAdmin(id);
    const session = await this.prisma.adminSession.findFirst({ where: { id: sessionId, adminId: id }, select: { id: true, adminId: true, revokedAt: true } });
    if (!session) throw new NotFoundException('Admin session not found.');
    const updated = await this.prisma.adminSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date(), revokeReason: dto.reason.trim() },
      select: this.sessionSelect(),
    });
    await this.audit.log({ adminId: actorId, adminRole: actorRole, targetType: 'admin_session', targetId: sessionId, action: 'admin.team.session.revoke', after: { adminId: id, revokedAt: updated.revokedAt }, reason: dto.reason.trim() });
    return updated;
  }

  async revokeAllSessions(actorId: string, actorRole: AdminRole, id: string, dto: AdminReasonDto) {
    await this.requireAdmin(id);
    const result = await this.prisma.adminSession.updateMany({ where: { adminId: id, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: dto.reason.trim() } });
    await this.audit.log({ adminId: actorId, adminRole: actorRole, targetType: 'admin', targetId: id, action: 'admin.team.sessions.revoke_all', after: { count: result.count }, reason: dto.reason.trim() });
    return { revoked: result.count };
  }

  async revokeSessions(adminId: string, reason: string) {
    await this.prisma.adminSession.updateMany({ where: { adminId, revokedAt: null }, data: { revokedAt: new Date(), revokeReason: reason.slice(0, 500) } });
  }

  private async requireAdmin(id: string) {
    const admin = await this.prisma.adminUser.findUnique({ where: { id }, select: { ...this.listSelect(), mustChangePassword: true, role: true, status: true } });
    if (!admin) throw new NotFoundException('Admin account not found.');
    return admin;
  }

  private async assertNotLastActiveSuperadmin(id: string) {
    const count = await this.prisma.adminUser.count({ where: { role: AdminRole.SUPERADMIN, status: { in: [AdminUserStatus.ACTIVE, AdminUserStatus.INVITED] } } });
    if (count <= 1) throw new BadRequestException('The last active superadmin cannot be removed or demoted.');
    if (id) return;
  }

  private listSelect() {
    return {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      lastLoginAt: true,
      suspendedAt: true,
    } as const;
  }

  private sessionSelect() {
    return { id: true, issuedAt: true, lastSeenAt: true, expiresAt: true, ipAddress: true, userAgent: true, revokedAt: true, revokeReason: true } as const;
  }

  private publicAdmin(admin: { id: string; email: string; name: string | null; role: AdminRole; status: AdminUserStatus }) {
    return { id: admin.id, email: admin.email, name: admin.name, role: admin.role, status: admin.status };
  }

  private auditSafe(admin: { id: string; email: string; name: string | null; role: AdminRole; status: AdminUserStatus }) {
    return this.publicAdmin(admin);
  }
}

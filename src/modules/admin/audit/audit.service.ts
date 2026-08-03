import { Injectable, Logger } from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuditQueryDto } from './dto/audit-query.dto';
import type { Prisma } from '@prisma/client';

export interface AuditEntry {
  adminId: string;
  adminRole: AdminRole;
  targetType: string;
  targetId?: string | null;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

/**
 * Single owner of the R11/R16 audit rule. Writes one append-only AuditLog row
 * (log) and reads with the R16 filters (findMany). Called by every admin write
 * endpoint and by the impersonation audit interceptor (KTD3/KTD5).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          adminId: entry.adminId,
          adminRole: entry.adminRole,
          targetType: entry.targetType,
          targetId: entry.targetId ?? null,
          action: entry.action,
          before: (entry.before ?? null) as never,
          after: (entry.after ?? null) as never,
          reason: entry.reason ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log: ${(err as Error).message}`);
    }
  }

  async findMany(q: AuditQueryDto) {
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 50;
    const where: Prisma.AuditLogWhereInput = {};
    if (q.adminId) where.adminId = q.adminId;
    if (q.targetType) where.targetType = q.targetType;
    if (q.targetId) where.targetId = q.targetId;
    if (q.action) where.action = { contains: q.action };
    if (q.role) where.adminRole = q.role;
    if (q.q) {
      where.OR = [
        { action: { contains: q.q, mode: 'insensitive' } },
        { targetType: { contains: q.q, mode: 'insensitive' } },
        { targetId: { contains: q.q, mode: 'insensitive' } },
        { reason: { contains: q.q, mode: 'insensitive' } },
      ];
    }
    if (q.from || q.to) {
      where.at = {};
      if (q.from) where.at.gte = new Date(q.from);
      if (q.to) where.at.lte = new Date(q.to);
    }
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    const adminIds = [...new Set(items.map((item) => item.adminId))];
    const admins = await this.prisma.adminUser.findMany({
      where: { id: { in: adminIds } },
      select: { id: true, email: true, name: true, role: true },
    });
    const adminById = new Map(admins.map((admin) => [admin.id, admin]));
    return {
      items: items.map((item) => ({
        ...item,
        before: this.redact(item.before),
        after: this.redact(item.after),
        admin: adminById.get(item.adminId) ?? null,
      })),
      total,
      page,
      pageSize,
    };
  }

  async filters() {
    const [admins, targetTypes, actions] = await Promise.all([
      this.prisma.adminUser.findMany({ select: { id: true, email: true, name: true, role: true }, orderBy: { email: 'asc' } }),
      this.prisma.auditLog.findMany({ distinct: ['targetType'], select: { targetType: true }, orderBy: { targetType: 'asc' } }),
      this.prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
    ]);
    return {
      admins,
      targetTypes: targetTypes.map((item) => item.targetType),
      actions: actions.map((item) => item.action),
    };
  }

  async csv(q: AuditQueryDto) {
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = q.to ? new Date(q.to) : new Date();
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) throw new Error('Invalid audit export date range.');
    if (to.getTime() - from.getTime() > 90 * 24 * 60 * 60 * 1000) throw new Error('Audit export range cannot exceed 90 days.');
    const result = await this.findMany({ ...q, from: from.toISOString(), to: to.toISOString(), page: 1, pageSize: 10000 });
    const rows = [['id', 'at', 'admin_email', 'admin_role', 'action', 'target_type', 'target_id', 'reason', 'before', 'after']];
    for (const item of result.items) {
      rows.push([
        item.id,
        new Date(item.at).toISOString(),
        item.admin?.email ?? item.adminId,
        item.adminRole,
        item.action,
        item.targetType,
        item.targetId ?? '',
        item.reason ?? '',
        JSON.stringify(item.before ?? ''),
        JSON.stringify(item.after ?? ''),
      ]);
    }
    return rows.map((row) => row.map((cell) => this.csvCell(cell)).join(',')).join('\n');
  }

  private redact(value: unknown, depth = 0): unknown {
    if (value === null || value === undefined) return value;
    if (depth > 5) return '[TRUNCATED]';
    if (Array.isArray(value)) return value.slice(0, 100).map((item) => this.redact(item, depth + 1));
    if (typeof value !== 'object') return typeof value === 'string' && value.length > 1000 ? `${value.slice(0, 1000)}…` : value;
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
      if (/(password|token|secret|credential|bank|ifsc|accountnumber|payload|bodyhtml|messagebody)/i.test(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = this.redact(item, depth + 1);
      }
    }
    return result;
  }

  private csvCell(value: unknown) {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }
}

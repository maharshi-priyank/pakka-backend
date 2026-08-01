import { Injectable, Logger } from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AuditQueryDto } from './dto/audit-query.dto';

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
    const where: Record<string, unknown> = {};
    if (q.adminId) where.adminId = q.adminId;
    if (q.targetType) where.targetType = q.targetType;
    if (q.targetId) where.targetId = q.targetId;
    if (q.action) where.action = { contains: q.action };
    if (q.from || q.to) {
      where.at = {};
      if (q.from) (where.at as Record<string, unknown>).gte = new Date(q.from);
      if (q.to) (where.at as Record<string, unknown>).lte = new Date(q.to);
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
    return { items, total, page, pageSize };
  }
}

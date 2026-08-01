import { Injectable, Logger } from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

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
 * Single owner of the R11/R16 audit rule. Writes one append-only AuditLog row.
 * Called by every admin write endpoint and by the impersonation audit
 * interceptor (KTD3). The read endpoint (R16 filters) is added in U4.
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
}

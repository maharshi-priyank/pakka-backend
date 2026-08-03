import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { AdminRole } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AdminBillingOperationsService } from '../billing-operations/admin-billing-operations.service';
import { AdminSecurityService } from '../security/admin-security.service';
import { AdminSupportReportingService } from '../support-reporting/admin-support-reporting.service';

export interface AdminAlert {
  fingerprint: string;
  source: 'billing' | 'support' | 'security';
  severity: 'normal' | 'warning' | 'critical';
  title: string;
  description: string;
  userId?: string;
  workspaceId?: string;
  billingEventId?: string;
  at: string;
}

@Injectable()
export class AdminAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: AdminBillingOperationsService,
    private readonly support: AdminSupportReportingService,
    private readonly security: AdminSecurityService,
  ) {}

  async list(adminId: string, adminRole: AdminRole) {
    const [billing, support, dismissals] = await Promise.all([
      this.billing.summary({}),
      this.support.queue({ page: 1, pageSize: 50, type: 'all' }),
      this.prisma.adminAlertDismissal.findMany({ where: { adminId }, select: { fingerprint: true, dismissedAt: true } }),
    ]);

    const alerts: AdminAlert[] = [
      ...billing.alerts.map((alert) => this.withFingerprint({
        source: 'billing',
        severity: alert.severity,
        title: alert.title,
        description: alert.description,
        userId: 'userId' in alert ? alert.userId : undefined,
        workspaceId: alert.workspaceId,
        billingEventId: 'billingEventId' in alert ? alert.billingEventId : undefined,
        at: alert.at,
      }, `billing:${alert.id}`)),
      ...support.items.map((row) => this.withFingerprint({
        source: 'support',
        severity: row.priority === 'critical' ? 'critical' : row.priority === 'high' ? 'warning' : 'normal',
        title: row.subject,
        description: row.reason,
        userId: row.userId ?? undefined,
        workspaceId: row.workspaceId ?? undefined,
        at: row.lastKnownActivityAt ?? row.createdAt,
      }, `support:${row.id}`)),
    ];

    if (adminRole === AdminRole.SUPERADMIN) {
      const security = await this.security.overview({});
      if (security.failedAttemptsLast24h > 0) {
        alerts.push(this.withFingerprint({
          source: 'security',
          severity: security.failedAttemptsLast24h >= 10 ? 'critical' : 'warning',
          title: 'Failed admin login attempts detected',
          description: `${security.failedAttemptsLast24h} failed attempt${security.failedAttemptsLast24h === 1 ? '' : 's'} in the last 24 hours.`,
          at: new Date().toISOString(),
        }, `security:failed-login:${new Date().toISOString().slice(0, 10)}`));
      }
    }

    const dismissed = new Map(dismissals.map((item) => [item.fingerprint, item.dismissedAt]));
    const items = alerts
      .filter((alert) => !dismissed.has(alert.fingerprint))
      .sort((a, b) => this.severityRank(b.severity) - this.severityRank(a.severity) || new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 100);

    return {
      items,
      total: items.length,
      dataQuality: {
        securityEventsAvailable: adminRole === AdminRole.SUPERADMIN,
        supportQueueIsDerived: true as const,
      },
    };
  }

  async dismiss(adminId: string, fingerprint: string) {
    await this.prisma.adminAlertDismissal.upsert({
      where: { adminId_fingerprint: { adminId, fingerprint } },
      create: { adminId, fingerprint },
      update: { dismissedAt: new Date() },
    });
    return { dismissed: true, fingerprint };
  }

  private withFingerprint(alert: Omit<AdminAlert, 'fingerprint'>, sourceKey: string): AdminAlert {
    return {
      ...alert,
      fingerprint: createHash('sha256').update(sourceKey).digest('hex'),
    };
  }

  private severityRank(severity: AdminAlert['severity']) {
    return severity === 'critical' ? 3 : severity === 'warning' ? 2 : 1;
  }
}

import { Injectable } from '@nestjs/common';
import { AdminRole, AdminCustomerTaskStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AdminAlertsService } from '../alerts/admin-alerts.service';
import { AdminCustomersService } from '../customers/admin-customers.service';
import { AdminOperationsService } from '../operations/admin-operations.service';
import type { AdminCommandCenterQueryDto } from './dto/admin-command-center.dto';

@Injectable()
export class AdminCommandCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly alerts: AdminAlertsService,
    private readonly customers: AdminCustomersService,
    private readonly operations: AdminOperationsService,
  ) {}

  async overview(adminId: string, adminRole: AdminRole, query: AdminCommandCenterQueryDto = {}) {
    const limit = query.limit ?? 10;
    const windowHours = query.windowHours ?? 24;
    const [operations, customers, alerts, tasks] = await Promise.all([
      this.operations.overview({ windowHours }),
      this.customers.overview(),
      this.alerts.list(adminId, adminRole),
      this.prisma.adminCustomerTask.findMany({
        where: { status: { in: [AdminCustomerTaskStatus.OPEN, AdminCustomerTaskStatus.IN_PROGRESS] } },
        orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
        take: 100,
        include: { owner: { select: { id: true, name: true, email: true } } },
      }),
    ]);
    const now = Date.now();
    const priorityFeed = [
      ...operations.incidents.map((incident) => ({
        id: `incident:${incident.id}`,
        type: 'incident',
        priority: incident.severity === 'CRITICAL' ? 'critical' : incident.severity === 'WARNING' ? 'warning' : 'normal',
        title: incident.title,
        description: incident.description ?? incident.service,
        at: incident.lastSeenAt,
        target: { type: 'incident', id: incident.id, path: `/admin/incidents/${incident.id}` },
      })),
      ...customers.topAtRisk.map((customer) => ({
        id: `customer:${customer.id}`,
        type: 'customer',
        priority: customer.lifecycle === 'PAST_DUE' || customer.lifecycle === 'CHURNED' ? 'critical' : 'warning',
        title: `${customer.name} needs attention`,
        description: `${customer.lifecycle.replace('_', ' ')} · health ${customer.healthScore}/100`,
        at: customer.updatedAt,
        target: { type: 'customer', id: customer.id, path: `/admin/customers/${customer.id}` },
      })),
      ...tasks.filter((task) => task.dueAt && task.dueAt.getTime() < now).map((task) => ({
        id: `task:${task.id}`,
        type: 'task',
        priority: 'warning',
        title: `Overdue: ${task.title}`,
        description: task.owner?.name || task.owner?.email || 'Unassigned follow-up',
        at: task.dueAt ?? new Date(),
        target: { type: 'customer', id: task.targetId, path: `/admin/customers/${task.targetId}` },
      })),
      ...alerts.items.slice(0, 50).map((alert) => ({
        id: `alert:${alert.fingerprint}`,
        type: 'alert',
        priority: alert.severity,
        title: alert.title,
        description: alert.description,
        at: alert.at,
        target: alert.workspaceId ? { type: 'workspace', id: alert.workspaceId, path: `/admin/workspaces/${alert.workspaceId}` } : { type: 'alerts', id: alert.fingerprint, path: '/admin/alerts' },
      })),
    ].sort((a, b) => this.priorityRank(b.priority) - this.priorityRank(a.priority) || new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, limit * 4);
    return {
      generatedAt: new Date().toISOString(),
      health: { status: operations.status, summary: operations.summary, signals: operations.signals.slice(0, limit) },
      customers: { total: customers.total, active: customers.active, lifecycle: customers.lifecycle, health: customers.health, topAtRisk: customers.topAtRisk.slice(0, limit) },
      workQueue: { open: tasks.length, overdue: tasks.filter((task) => task.dueAt && task.dueAt.getTime() < now).length, tasks: tasks.slice(0, limit) },
      alerts: { total: alerts.total, items: alerts.items.slice(0, limit) },
      priorityFeed,
      links: { customers: '/admin/customers', incidents: '/admin/incidents', operations: '/admin/operations', team: '/admin/team', businessIntelligence: '/admin/bi' },
      dataQuality: { feedCombinesDerivedAndPersistedSignals: true as const, customerActivityIsProxy: true as const },
    };
  }

  async export(adminId: string, adminRole: AdminRole, query: AdminCommandCenterQueryDto = {}) {
    const result = await this.overview(adminId, adminRole, { ...query, limit: 50 });
    const rows = [['type', 'priority', 'title', 'description', 'at', 'target_type', 'target_id', 'path']];
    for (const item of result.priorityFeed) rows.push([item.type, item.priority, item.title, item.description, new Date(item.at).toISOString(), item.target.type, item.target.id, item.target.path]);
    return rows.map((row) => row.map((value) => this.csvCell(value)).join(',')).join('\n');
  }

  private priorityRank(value: string) { return value === 'critical' ? 3 : value === 'warning' ? 2 : 1; }
  private csvCell(value: unknown) { const text = String(value ?? ''); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }
}

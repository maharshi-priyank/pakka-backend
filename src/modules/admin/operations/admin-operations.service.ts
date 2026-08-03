import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AdminIncidentSeverity,
  AdminIncidentSource,
  AdminIncidentStatus,
  AdminRole,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type {
  AdminIncidentQueryDto,
  AdminIncidentReasonDto,
  AdminOperationsQueryDto,
  AssignIncidentDto,
  CreateAdminIncidentDto,
  IncidentCommentDto,
  IncidentRecoveryDto,
} from './dto/admin-operations.dto';

type Signal = {
  fingerprint: string;
  source: AdminIncidentSource;
  service: string;
  title: string;
  description: string;
  count: number;
  severity: AdminIncidentSeverity;
  workspaceId?: string;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AdminOperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async overview(query: AdminOperationsQueryDto = {}) {
    const windowHours = query.windowHours ?? 24;
    const from = new Date(Date.now() - windowHours * 60 * 60 * 1000);
    const [automationFailed, workflowFailed, workflowRunning, communicationFailed, billingFailed, securityFailed, integrations] = await Promise.all([
      this.prisma.automationExecution.count({ where: { status: 'FAILED', firedAt: { gte: from }, ...(query.workspaceId ? { rule: { workspaceId: query.workspaceId } } : {}) } }),
      this.prisma.workflowRun.count({ where: { status: 'FAILED', startedAt: { gte: from }, ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}) } }),
      this.prisma.workflowRun.count({ where: { status: 'RUNNING', nextFireAt: { lt: new Date() }, ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}) } }),
      this.prisma.communicationLog.count({ where: { status: { contains: 'fail', mode: 'insensitive' }, sentAt: { gte: from }, ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}) } }),
      this.prisma.billingEvent.count({ where: { processedAt: { gte: from }, ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}) } }).then(async (count) => count ? this.failedBillingEvents(from, query.workspaceId) : 0),
      this.prisma.adminSecurityEvent.count({ where: { outcome: 'FAILURE', at: { gte: from } } }),
      this.integrationSignals(query.workspaceId),
    ]);

    const signals: Signal[] = [
      this.signal('automation:failed', AdminIncidentSource.AUTOMATION, 'automation', 'Automation executions failing', `${automationFailed} automation execution${automationFailed === 1 ? '' : 's'} failed in the last ${windowHours} hours.`, automationFailed, 5, query.workspaceId),
      this.signal('workflow:failed', AdminIncidentSource.WORKFLOW, 'workflow', 'Workflow runs failing', `${workflowFailed} workflow run${workflowFailed === 1 ? '' : 's'} failed in the last ${windowHours} hours.`, workflowFailed, 5, query.workspaceId),
      this.signal('workflow:stuck', AdminIncidentSource.WORKFLOW, 'workflow', 'Workflow runs are overdue', `${workflowRunning} running workflow run${workflowRunning === 1 ? '' : 's'} are past the next scheduled step.`, workflowRunning, 1, query.workspaceId),
      this.signal('communication:failed', AdminIncidentSource.COMMUNICATION, 'communications', 'Communication delivery failures', `${communicationFailed} communication${communicationFailed === 1 ? '' : 's'} failed in the last ${windowHours} hours.`, communicationFailed, 10, query.workspaceId),
      this.signal('billing:failed', AdminIncidentSource.BILLING, 'billing', 'Billing events may require attention', `${billingFailed} billing event${billingFailed === 1 ? '' : 's'} look failed in the last ${windowHours} hours.`, billingFailed, 3, query.workspaceId),
      this.signal('security:failed-login', AdminIncidentSource.SECURITY, 'admin-auth', 'Failed admin login attempts', `${securityFailed} failed admin login attempt${securityFailed === 1 ? '' : 's'} detected in the last ${windowHours} hours.`, securityFailed, 10),
      ...integrations,
    ];

    for (const signal of signals) await this.syncSignal(signal);
    const openIncidents = await this.prisma.adminIncident.findMany({
      where: { status: { in: [AdminIncidentStatus.OPEN, AdminIncidentStatus.ACKNOWLEDGED, AdminIncidentStatus.REOPENED] }, ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}) },
      orderBy: [{ severity: 'desc' }, { lastSeenAt: 'desc' }],
      take: 100,
      select: this.incidentListSelect(),
    });
    const critical = openIncidents.filter((item) => item.severity === AdminIncidentSeverity.CRITICAL).length;
    const degraded = signals.filter((signal) => signal.count > 0).length;
    return {
      window: { from: from.toISOString(), to: new Date().toISOString(), hours: windowHours },
      status: critical > 0 ? 'CRITICAL' : degraded > 0 ? 'DEGRADED' : 'HEALTHY',
      signals: signals.map((signal) => ({ ...signal, status: this.signalStatus(signal) })),
      summary: { openIncidents: openIncidents.length, criticalIncidents: critical, degradedSignals: degraded },
      incidents: openIncidents,
      dataQuality: { apiLatencyTelemetryAvailable: false as const, workerHeartbeatAvailable: false as const, healthIsDatabaseDerived: true as const },
    };
  }

  async failures(query: AdminOperationsQueryDto = {}) {
    const from = new Date(Date.now() - (query.windowHours ?? 24) * 60 * 60 * 1000);
    const [automations, workflows, communications, billing] = await Promise.all([
      this.prisma.automationExecution.findMany({ where: { status: 'FAILED', firedAt: { gte: from }, ...(query.workspaceId ? { rule: { workspaceId: query.workspaceId } } : {}) }, orderBy: { firedAt: 'desc' }, take: 100, select: { id: true, ruleId: true, entityId: true, entityType: true, error: true, firedAt: true, rule: { select: { name: true, workspaceId: true, workspace: { select: { name: true } } } } } }),
      this.prisma.workflowRun.findMany({ where: { status: { in: ['FAILED', 'CANCELLED'] }, startedAt: { gte: from }, ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}) }, orderBy: { startedAt: 'desc' }, take: 100, select: { id: true, workflowId: true, workspaceId: true, entityId: true, entityType: true, status: true, startedAt: true, completedAt: true, workflow: { select: { name: true } } } }),
      this.prisma.communicationLog.findMany({ where: { status: { contains: 'fail', mode: 'insensitive' }, sentAt: { gte: from }, ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}) }, orderBy: { sentAt: 'desc' }, take: 100, select: { id: true, workspaceId: true, contactId: true, channel: true, status: true, error: true, entityId: true, entityType: true, sentAt: true } }),
      this.prisma.billingEvent.findMany({ where: { processedAt: { gte: from }, ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}) }, orderBy: { processedAt: 'desc' }, take: 200, select: { id: true, eventType: true, workspaceId: true, processedAt: true, payload: true } }),
    ]);
    return {
      window: { from: from.toISOString(), to: new Date().toISOString() },
      automation: automations.map((row) => ({ ...row, error: this.redactText(row.error), workspace: row.rule.workspace })),
      workflow: workflows,
      communication: communications.map((row) => ({ ...row, error: this.redactText(row.error) })),
      billing: billing.filter((row) => this.isFailedBilling(row.eventType, row.payload)).map((row) => ({ id: row.id, eventType: row.eventType, workspaceId: row.workspaceId, processedAt: row.processedAt })),
    };
  }

  async list(query: AdminIncidentQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const search = query.q?.trim();
    const where: Prisma.AdminIncidentWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.source ? { source: query.source } : {}),
      ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}),
      ...(search ? { OR: [{ title: { contains: search, mode: 'insensitive' } }, { description: { contains: search, mode: 'insensitive' } }, { service: { contains: search, mode: 'insensitive' } }, { fingerprint: { contains: search, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.adminIncident.findMany({ where, orderBy: [{ status: 'asc' }, { severity: 'desc' }, { lastSeenAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize, select: this.incidentListSelect() }),
      this.prisma.adminIncident.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async detail(id: string) {
    const incident = await this.prisma.adminIncident.findUnique({ where: { id }, include: { workspace: { select: { id: true, name: true } }, owner: { select: { id: true, name: true, email: true, role: true } }, events: { orderBy: { createdAt: 'asc' }, include: { actor: { select: { id: true, name: true, email: true, role: true } } } } } });
    if (!incident) throw new NotFoundException('Incident not found.');
    return { ...incident, metadata: this.redactJson(incident.metadata) };
  }

  async create(adminId: string, adminRole: AdminRole, dto: CreateAdminIncidentDto) {
    if (dto.workspaceId) await this.assertWorkspace(dto.workspaceId);
    const fingerprint = `manual:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
    const incident = await this.prisma.adminIncident.create({ data: { fingerprint, source: dto.source, service: dto.service.trim(), title: dto.title.trim(), description: dto.description?.trim() || null, severity: dto.severity ?? AdminIncidentSeverity.WARNING, workspaceId: dto.workspaceId ?? null, metadata: {} }, select: { id: true, fingerprint: true, status: true, severity: true, title: true } });
    await this.addEvent(incident.id, adminId, 'created', dto.description?.trim() || 'Incident created manually.');
    await this.audit.log({ adminId, adminRole, targetType: 'admin_incident', targetId: incident.id, action: 'admin.incident.create', after: { source: incident, workspaceId: dto.workspaceId ?? null } });
    return incident;
  }

  async acknowledge(adminId: string, adminRole: AdminRole, id: string, dto: AdminIncidentReasonDto) {
    return this.transition(adminId, adminRole, id, AdminIncidentStatus.ACKNOWLEDGED, 'acknowledged', dto.reason, { acknowledgedAt: new Date() });
  }

  async resolve(adminId: string, adminRole: AdminRole, id: string, dto: AdminIncidentReasonDto) {
    return this.transition(adminId, adminRole, id, AdminIncidentStatus.RESOLVED, 'resolved', dto.reason, { resolvedAt: new Date(), resolution: dto.reason.trim() });
  }

  async reopen(adminId: string, adminRole: AdminRole, id: string, dto: AdminIncidentReasonDto) {
    return this.transition(adminId, adminRole, id, AdminIncidentStatus.REOPENED, 'reopened', dto.reason, { resolvedAt: null });
  }

  async assign(adminId: string, adminRole: AdminRole, id: string, dto: AssignIncidentDto) {
    const before = await this.requireIncident(id);
    if (dto.ownerAdminId) {
      const owner = await this.prisma.adminUser.findUnique({ where: { id: dto.ownerAdminId }, select: { id: true, status: true } });
      if (!owner) throw new NotFoundException('Admin owner not found.');
      if (owner.status !== 'ACTIVE') throw new BadRequestException('Incident owner must be active.');
    }
    const after = await this.prisma.adminIncident.update({ where: { id }, data: { ownerAdminId: dto.ownerAdminId ?? null }, select: this.incidentListSelect() });
    await this.addEvent(id, adminId, 'assigned', dto.ownerAdminId ? `Assigned to admin ${dto.ownerAdminId}.` : 'Incident unassigned.');
    await this.audit.log({ adminId, adminRole, targetType: 'admin_incident', targetId: id, action: 'admin.incident.assign', before: { ownerAdminId: before.ownerAdminId }, after: { ownerAdminId: after.ownerAdminId }, reason: dto.reason ?? null });
    return after;
  }

  async comment(adminId: string, adminRole: AdminRole, id: string, dto: IncidentCommentDto) {
    await this.requireIncident(id);
    const event = await this.addEvent(id, adminId, 'comment', dto.message.trim());
    await this.audit.log({ adminId, adminRole, targetType: 'admin_incident', targetId: id, action: 'admin.incident.comment', after: { eventId: event.id } });
    return event;
  }

  async recover(adminId: string, adminRole: AdminRole, incidentId: string, dto: IncidentRecoveryDto) {
    await this.requireIncident(incidentId);
    let result: Record<string, unknown>;
    if (dto.action === 'cancel_workflow') {
      const run = await this.prisma.workflowRun.findUnique({ where: { id: dto.targetId }, select: { id: true, status: true, workspaceId: true } });
      if (!run) throw new NotFoundException('Workflow run not found.');
      if (run.status !== 'RUNNING') throw new BadRequestException('Only running workflow runs can be cancelled.');
      const updated = await this.prisma.workflowRun.update({ where: { id: run.id }, data: { status: 'CANCELLED', completedAt: new Date() }, select: { id: true, status: true, completedAt: true } });
      result = updated;
    } else if (dto.action === 'disable_automation') {
      const rule = await this.prisma.automationRule.findUnique({ where: { id: dto.targetId }, select: { id: true, isActive: true, name: true, workspaceId: true } });
      if (!rule) throw new NotFoundException('Automation rule not found.');
      const updated = await this.prisma.automationRule.update({ where: { id: rule.id }, data: { isActive: false }, select: { id: true, isActive: true, name: true } });
      result = updated;
    } else {
      const workflow = await this.prisma.automationWorkflow.findUnique({ where: { id: dto.targetId }, select: { id: true, isActive: true, name: true, workspaceId: true } });
      if (!workflow) throw new NotFoundException('Automation workflow not found.');
      const updated = await this.prisma.automationWorkflow.update({ where: { id: workflow.id }, data: { isActive: false }, select: { id: true, isActive: true, name: true } });
      result = updated;
    }
    await this.addEvent(incidentId, adminId, 'recovery', `${dto.action} applied to ${dto.targetId}.`);
    await this.audit.log({ adminId, adminRole, targetType: 'admin_incident', targetId: incidentId, action: `admin.incident.recovery.${dto.action}`, after: { targetId: dto.targetId, result }, reason: dto.reason.trim() });
    return { action: dto.action, result };
  }

  private async transition(adminId: string, adminRole: AdminRole, id: string, status: AdminIncidentStatus, eventType: string, reason: string, extra: Record<string, unknown>) {
    const before = await this.requireIncident(id);
    const after = await this.prisma.adminIncident.update({ where: { id }, data: { status, ...extra }, select: this.incidentListSelect() });
    await this.addEvent(id, adminId, eventType, reason.trim());
    await this.audit.log({ adminId, adminRole, targetType: 'admin_incident', targetId: id, action: `admin.incident.${eventType}`, before: { status: before.status }, after: { status: after.status }, reason: reason.trim() });
    return after;
  }

  private async syncSignal(signal: Signal) {
    const activeStatuses = { in: [AdminIncidentStatus.OPEN, AdminIncidentStatus.ACKNOWLEDGED, AdminIncidentStatus.REOPENED] };
    const current = await this.prisma.adminIncident.findFirst({ where: { fingerprint: signal.fingerprint, status: activeStatuses, ...(signal.workspaceId ? { workspaceId: signal.workspaceId } : {}) }, orderBy: { lastSeenAt: 'desc' } });
    if (signal.count > 0) {
      if (current) {
        await this.prisma.adminIncident.update({ where: { id: current.id }, data: { lastSeenAt: new Date(), severity: signal.severity, description: signal.description, metadata: (signal.metadata ?? { count: signal.count }) as Prisma.InputJsonValue } });
        return;
      }
      const resolved = await this.prisma.adminIncident.findFirst({ where: { fingerprint: signal.fingerprint, status: AdminIncidentStatus.RESOLVED, ...(signal.workspaceId ? { workspaceId: signal.workspaceId } : {}) }, orderBy: { resolvedAt: 'desc' }, select: { id: true } });
      const incident = await this.prisma.adminIncident.create({ data: { fingerprint: signal.fingerprint, source: signal.source, service: signal.service, title: signal.title, description: signal.description, severity: signal.severity, status: resolved ? AdminIncidentStatus.REOPENED : AdminIncidentStatus.OPEN, workspaceId: signal.workspaceId ?? null, metadata: (signal.metadata ?? { count: signal.count }) as Prisma.InputJsonValue } });
      await this.addEvent(incident.id, null, resolved ? 'reopened' : 'detected', signal.description);
      return;
    }
    if (current) {
      await this.prisma.adminIncident.update({ where: { id: current.id }, data: { status: AdminIncidentStatus.RESOLVED, resolvedAt: new Date(), resolution: 'Signal recovered automatically.', lastSeenAt: new Date() } });
      await this.addEvent(current.id, null, 'auto_resolved', 'Signal recovered automatically.');
    }
  }

  private signal(fingerprint: string, source: AdminIncidentSource, service: string, title: string, description: string, count: number, criticalAt: number, workspaceId?: string): Signal {
    return { fingerprint, source, service, title, description, count, severity: count >= criticalAt ? AdminIncidentSeverity.CRITICAL : AdminIncidentSeverity.WARNING, workspaceId, metadata: { count } };
  }

  private signalStatus(signal: Signal) { return signal.count === 0 ? 'HEALTHY' : signal.severity === AdminIncidentSeverity.CRITICAL ? 'CRITICAL' : 'DEGRADED'; }

  private async failedBillingEvents(from: Date, workspaceId?: string) {
    const events = await this.prisma.billingEvent.findMany({ where: { processedAt: { gte: from }, ...(workspaceId ? { workspaceId } : {}) }, select: { eventType: true, payload: true } });
    return events.filter((event) => this.isFailedBilling(event.eventType, event.payload)).length;
  }

  private isFailedBilling(eventType: string, payload: unknown) { return /failed|failure|past_due|declined|cancelled/i.test(`${eventType} ${JSON.stringify(payload ?? {})}`); }

  private async integrationSignals(workspaceId?: string): Promise<Signal[]> {
    const where = workspaceId ? { workspaceId } : {};
    const [inactive, stale] = await Promise.all([
      this.prisma.whatsappConnection.count({ where: { ...where, isActive: false } }),
      this.prisma.whatsappConnection.count({ where: { ...where, updatedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }, isActive: true } }),
    ]);
    return [
      this.signal('integration:whatsapp-inactive', AdminIncidentSource.INTEGRATION, 'whatsapp', 'Inactive WhatsApp connections', `${inactive} WhatsApp connection${inactive === 1 ? '' : 's'} are inactive.`, inactive, 5, workspaceId),
      this.signal('integration:whatsapp-stale', AdminIncidentSource.INTEGRATION, 'whatsapp', 'Stale WhatsApp connections', `${stale} active WhatsApp connection${stale === 1 ? '' : 's'} have not been updated in 30 days.`, stale, 10, workspaceId),
    ];
  }

  private async requireIncident(id: string) {
    const incident = await this.prisma.adminIncident.findUnique({ where: { id }, select: { id: true, status: true, ownerAdminId: true, fingerprint: true } });
    if (!incident) throw new NotFoundException('Incident not found.');
    return incident;
  }

  private async assertWorkspace(id: string) {
    const workspace = await this.prisma.workspace.findUnique({ where: { id }, select: { id: true } });
    if (!workspace) throw new NotFoundException('Workspace not found.');
  }

  private async addEvent(incidentId: string, actorId: string | null, type: string, message: string) {
    return this.prisma.adminIncidentEvent.create({ data: { incidentId, actorId, type, message: message.slice(0, 4000), metadata: {} }, include: { actor: { select: { id: true, name: true, email: true, role: true } } } });
  }

  private incidentListSelect() {
    return { id: true, fingerprint: true, source: true, service: true, title: true, description: true, severity: true, status: true, workspaceId: true, ownerAdminId: true, firstSeenAt: true, lastSeenAt: true, acknowledgedAt: true, resolvedAt: true, resolution: true, workspace: { select: { id: true, name: true } }, owner: { select: { id: true, name: true, email: true } } } as const;
  }

  private redactText(value: string | null) { return value ? value.replace(/[\r\n]+/g, ' ').slice(0, 500) : null; }

  private redactJson(value: unknown): unknown {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.slice(0, 50).map((item) => this.redactJson(item));
    if (typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [/(token|secret|password|credential|payload|body)/i.test(key) ? key : key, /(token|secret|password|credential|payload|body)/i.test(key) ? '[REDACTED]' : this.redactJson(item)]));
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export type TimelineTargetType = 'user' | 'workspace';

export interface AdminTimelineEvent {
  id: string;
  type: string;
  label: string;
  description: string;
  at: Date;
  source: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}

type RecordItem = {
  id: string;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
  label: string;
  status?: string | null;
};

@Injectable()
export class AdminTimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async get(targetType: TimelineTargetType, targetId: string, limit = 100) {
    const workspaceIds = targetType === 'workspace'
      ? [targetId]
      : (await this.prisma.workspaceMember.findMany({
          where: { userId: targetId },
          select: { workspaceId: true },
        })).map((membership) => membership.workspaceId);

    const [target, workspaces, memberships, audits, billingEvents, contacts, projects, proposals, contracts, invoices, tasks] = await Promise.all([
      targetType === 'user'
        ? this.prisma.user.findUnique({ where: { id: targetId }, select: { id: true, createdAt: true } })
        : this.prisma.workspace.findUnique({ where: { id: targetId }, select: { id: true, name: true, createdAt: true } }),
      workspaceIds.length
        ? this.prisma.workspace.findMany({ where: { id: { in: workspaceIds } }, select: { id: true, name: true, createdAt: true } })
        : Promise.resolve([]),
      workspaceIds.length
        ? this.prisma.workspaceMember.findMany({
            where: targetType === 'user' ? { workspaceId: { in: workspaceIds }, userId: targetId } : { workspaceId: targetId },
            select: { id: true, userId: true, workspaceId: true, joinedAt: true, user: { select: { name: true, email: true } }, workspace: { select: { name: true } } },
            orderBy: { joinedAt: 'desc' },
            take: 100,
          })
        : Promise.resolve([]),
      this.prisma.auditLog.findMany({
        where: targetType === 'user'
          ? { targetType: 'user', targetId }
          : { targetType: 'workspace', targetId },
        select: { id: true, action: true, targetType: true, targetId: true, reason: true, at: true },
        orderBy: { at: 'desc' },
        take: 100,
      }),
      workspaceIds.length
        ? this.prisma.billingEvent.findMany({
            where: { workspaceId: { in: workspaceIds } },
            select: { id: true, eventType: true, workspaceId: true, payload: true, processedAt: true },
            orderBy: { processedAt: 'desc' },
            take: 100,
          })
        : Promise.resolve([]),
      this.prisma.contact.findMany({
        where: { workspaceId: { in: workspaceIds } },
        select: { id: true, workspaceId: true, name: true, stage: true, createdAt: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
      this.prisma.project.findMany({
        where: { workspaceId: { in: workspaceIds } },
        select: { id: true, workspaceId: true, name: true, status: true, createdAt: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
      this.prisma.proposal.findMany({
        where: { workspaceId: { in: workspaceIds } },
        select: { id: true, workspaceId: true, title: true, status: true, createdAt: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
      this.prisma.contract.findMany({
        where: { workspaceId: { in: workspaceIds } },
        select: { id: true, workspaceId: true, title: true, status: true, createdAt: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
      this.prisma.invoice.findMany({
        where: { workspaceId: { in: workspaceIds } },
        select: { id: true, workspaceId: true, invoiceNumber: true, status: true, total: true, currency: true, createdAt: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
      this.prisma.task.findMany({
        where: { workspaceId: { in: workspaceIds }, isPrivate: false },
        select: { id: true, workspaceId: true, title: true, status: true, createdAt: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
    ]);

    const workspaceNames = new Map(workspaces.map((workspace) => [workspace.id, workspace.name]));
    const events: AdminTimelineEvent[] = [];

    if (target && targetType === 'user') {
      events.push({
        id: `user.created:${target.id}`,
        type: 'user.created',
        label: 'Account created',
        description: 'User account was created.',
        at: target.createdAt,
        source: 'user',
        entityId: target.id,
      });
    }
    if (target && targetType === 'workspace') {
      const workspaceTarget = target as { id: string; name: string; createdAt: Date };
      events.push({
        id: `workspace.created:${workspaceTarget.id}`,
        type: 'workspace.created',
        label: 'Workspace created',
        description: `${workspaceTarget.name} was created.`,
        at: workspaceTarget.createdAt,
        source: 'workspace',
        entityId: workspaceTarget.id,
      });
    }

    for (const membership of memberships) {
      const workspaceName = membership.workspace.name;
      const memberName = membership.user.name || membership.user.email;
      events.push({
        id: `membership.joined:${membership.id}`,
        type: 'membership.joined',
        label: 'Workspace membership added',
        description: `${memberName} joined ${workspaceName}.`,
        at: membership.joinedAt,
        source: 'workspace_member',
        entityId: membership.id,
        metadata: { workspaceId: membership.workspaceId, workspaceName },
      });
    }

    for (const audit of audits) {
      events.push({
        id: `audit:${audit.id}`,
        type: 'admin.action',
        label: this.humanize(audit.action),
        description: audit.reason ? `${this.humanize(audit.action)} — ${audit.reason}` : this.humanize(audit.action),
        at: audit.at,
        source: 'audit_log',
        entityId: audit.targetId ?? undefined,
        metadata: { action: audit.action, targetType: audit.targetType },
      });
    }

    for (const billing of billingEvents) {
      const payload = this.asRecord(billing.payload);
      const metadata: Record<string, unknown> = {
        workspaceId: billing.workspaceId,
        workspaceName: billing.workspaceId ? workspaceNames.get(billing.workspaceId) : undefined,
        currency: this.stringValue(payload?.currency)?.toUpperCase(),
        amount: this.numberValue(payload?.amount),
      };
      events.push({
        id: `billing:${billing.id}`,
        type: 'billing.event',
        label: this.humanize(billing.eventType),
        description: billing.workspaceId && workspaceNames.get(billing.workspaceId)
          ? `${this.humanize(billing.eventType)} for ${workspaceNames.get(billing.workspaceId)}.`
          : this.humanize(billing.eventType),
        at: billing.processedAt,
        source: 'billing_event',
        entityId: billing.id,
        metadata,
      });
    }

    this.addRecordEvents(events, contacts.map((item) => ({ ...item, label: item.name })), 'contact', 'Contact');
    this.addRecordEvents(events, projects.map((item) => ({ ...item, label: item.name })), 'project', 'Project');
    this.addRecordEvents(events, proposals.map((item) => ({ ...item, label: item.title })), 'proposal', 'Proposal');
    this.addRecordEvents(events, contracts.map((item) => ({ ...item, label: item.title })), 'contract', 'Contract');
    this.addRecordEvents(events, invoices.map((item) => ({ ...item, label: item.invoiceNumber })), 'invoice', 'Invoice');
    this.addRecordEvents(events, tasks.map((item) => ({ ...item, label: item.title })), 'task', 'Task');

    return events
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, Math.min(Math.max(limit, 1), 200));
  }

  private addRecordEvents(
    events: AdminTimelineEvent[],
    records: RecordItem[],
    type: string,
    label: string,
  ) {
    for (const record of records) {
      const workspaceName = record.workspaceId;
      events.push({
        id: `${type}:${record.id}`,
        type: `${type}.updated`,
        label: `${label} updated`,
        description: record.status ? `${record.label} · ${this.humanize(record.status)}` : record.label,
        at: record.updatedAt,
        source: type,
        entityId: record.id,
        metadata: { workspaceId: workspaceName, status: record.status ?? undefined },
      });
    }
  }

  private humanize(value: string) {
    return value
      .replace(/[._-]+/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  }

  private stringValue(value: unknown) {
    return typeof value === 'string' ? value : null;
  }

  private numberValue(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
    return undefined;
  }
}

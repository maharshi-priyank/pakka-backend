import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AdminRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { AdminAutomationQueryDto, AdminAutomationToggleDto, AdminWorkflowQueryDto } from './dto/admin-automation.dto';

@Injectable()
export class AdminAutomationConfigurationService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listRules(query: AdminAutomationQueryDto = {}) {
    const rows = await this.prisma.automationRule.findMany({
      where: { ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}), ...(query.active === undefined ? {} : { isActive: query.active }) },
      include: { workspace: { select: { id: true, name: true } }, _count: { select: { executions: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    });
    const search = query.q?.trim().toLowerCase();
    const filtered = rows.filter((row) => !search || [row.name, row.key, row.category, row.triggerEvent, row.actionType, row.workspace.name].some((value) => value.toLowerCase().includes(search)));
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    return {
      items: filtered.slice((page - 1) * pageSize, page * pageSize).map((row) => ({ id: row.id, workspace: row.workspace, key: row.key, name: row.name, description: row.description, category: row.category, triggerEvent: row.triggerEvent, actionType: row.actionType, isActive: row.isActive, isSystem: row.isSystem, runCount: row.runCount, executionCount: row._count.executions, lastRunAt: row.lastRunAt, updatedAt: row.updatedAt })),
      total: filtered.length,
      page,
      pageSize,
    };
  }

  async ruleExecutions(id: string, limit = 50) {
    const rule = await this.prisma.automationRule.findUnique({ where: { id }, select: { id: true } });
    if (!rule) throw new NotFoundException('Automation rule not found.');
    const runs = await this.prisma.automationExecution.findMany({ where: { ruleId: id }, orderBy: { firedAt: 'desc' }, take: Math.min(limit, 100), select: { id: true, entityId: true, entityType: true, status: true, error: true, firedAt: true } });
    return runs.map((run) => ({ ...run, error: run.error?.replace(/[\r\n]+/g, ' ').slice(0, 500) ?? null }));
  }

  async toggleRule(adminId: string, adminRole: AdminRole, id: string, dto: AdminAutomationToggleDto) {
    const before = await this.prisma.automationRule.findUnique({ where: { id }, select: { id: true, workspaceId: true, isActive: true, name: true } });
    if (!before) throw new NotFoundException('Automation rule not found.');
    const after = await this.prisma.automationRule.update({ where: { id }, data: { isActive: dto.isActive }, select: { id: true, workspaceId: true, isActive: true, name: true } });
    await this.audit.log({ adminId, adminRole, targetType: 'automation_rule', targetId: id, action: 'admin.configuration.automation.toggle', before, after, reason: dto.reason ?? null });
    return after;
  }

  async listWorkflows(query: AdminWorkflowQueryDto = {}) {
    const rows = await this.prisma.automationWorkflow.findMany({
      where: { ...(query.workspaceId ? { workspaceId: query.workspaceId } : {}), ...(query.active === undefined ? {} : { isActive: query.active }) },
      include: { workspace: { select: { id: true, name: true } }, _count: { select: { runs: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 5000,
    });
    const search = query.q?.trim().toLowerCase();
    const filtered = rows.filter((row) => !search || [row.name, row.description, row.workspace.name].some((value) => value?.toLowerCase().includes(search)));
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    return {
      items: filtered.slice((page - 1) * pageSize, page * pageSize).map((row) => ({ id: row.id, workspace: row.workspace, name: row.name, description: row.description, isActive: row.isActive, runCount: row.runCount, runCountFromHistory: row._count.runs, lastRunAt: row.lastRunAt, updatedAt: row.updatedAt })),
      total: filtered.length,
      page,
      pageSize,
    };
  }

  async workflowRuns(id: string, limit = 50) {
    const workflow = await this.prisma.automationWorkflow.findUnique({ where: { id }, select: { id: true } });
    if (!workflow) throw new NotFoundException('Workflow not found.');
    return this.prisma.workflowRun.findMany({ where: { workflowId: id }, orderBy: { startedAt: 'desc' }, take: Math.min(limit, 100), select: { id: true, workspaceId: true, entityId: true, entityType: true, status: true, nextFireAt: true, startedAt: true, completedAt: true } });
  }

  async toggleWorkflow(adminId: string, adminRole: AdminRole, id: string, dto: AdminAutomationToggleDto) {
    const before = await this.prisma.automationWorkflow.findUnique({ where: { id }, select: { id: true, workspaceId: true, isActive: true, name: true } });
    if (!before) throw new NotFoundException('Workflow not found.');
    const after = await this.prisma.automationWorkflow.update({ where: { id }, data: { isActive: dto.isActive }, select: { id: true, workspaceId: true, isActive: true, name: true } });
    await this.audit.log({ adminId, adminRole, targetType: 'automation_workflow', targetId: id, action: 'admin.configuration.workflow.toggle', before, after, reason: dto.reason ?? null });
    return after;
  }

  async cancelRun(adminId: string, adminRole: AdminRole, id: string, reason?: string) {
    const run = await this.prisma.workflowRun.findUnique({ where: { id }, select: { id: true, workspaceId: true, status: true, workflowId: true } });
    if (!run) throw new NotFoundException('Workflow run not found.');
    if (run.status !== 'RUNNING') throw new BadRequestException('Only running workflow runs can be cancelled.');
    const after = await this.prisma.workflowRun.update({ where: { id }, data: { status: 'CANCELLED', completedAt: new Date() }, select: { id: true, workspaceId: true, status: true, completedAt: true } });
    await this.audit.log({ adminId, adminRole, targetType: 'workflow_run', targetId: id, action: 'admin.configuration.workflow_run.cancel', before: { status: run.status, workflowId: run.workflowId }, after, reason: reason ?? null });
    return after;
  }
}

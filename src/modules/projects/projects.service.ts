import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoiceStatus, ProjectStatus } from '@prisma/client';

export interface CreateProjectDto {
  name:                string;
  description?:        string;
  clientId?:           string;
  status?:             ProjectStatus;
  budget?:             number;
  startDate?:          string;
  endDate?:            string;
  shareRateWithClient?: boolean;
}

export interface UpdateProjectDto extends Partial<CreateProjectDto> {}

export interface QueryProjectsDto {
  search?:          string;
  status?:          ProjectStatus;
  clientId?:        string;
  page?:            number;
  limit?:           number;
  includeArchived?: boolean;
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  private n(v: { toString(): string } | null | undefined): number {
    return v ? Number(v.toString()) : 0;
  }

  async create(workspaceId: string, dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
        workspaceId,
        name:        dto.name,
        description: dto.description,
        clientId:    dto.clientId,
        status:      dto.status ?? 'ACTIVE',
        budget:      dto.budget,
        startDate:   dto.startDate ? new Date(dto.startDate) : undefined,
        endDate:     dto.endDate   ? new Date(dto.endDate)   : undefined,
      },
      include: {
        client: { select: { id: true, name: true, company: true } },
        _count: { select: { proposals: true, contracts: true, invoices: true, timeEntries: true, expenses: true } },
      },
    });
  }

  async findAll(workspaceId: string, query: QueryProjectsDto) {
    const { page = 1, limit = 20, search, status, clientId, includeArchived } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { workspaceId };
    if (!includeArchived) where['archivedAt'] = null;
    if (status)   where['status']   = status;
    if (clientId) where['clientId'] = clientId;
    if (search) {
      where['OR'] = [
        { name:        { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [projects, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip,
        take:     limit,
        orderBy:  { createdAt: 'desc' },
        include: {
          client: { select: { id: true, name: true, company: true } },
          _count: { select: { proposals: true, contracts: true, invoices: true, timeEntries: true, expenses: true } },
          invoices: {
            where: { status: { not: 'DRAFT' } },
            select: { status: true, total: true, amountPaid: true },
          },
        },
      }),
      this.prisma.project.count({ where }),
    ]);

    const enriched = projects.map(p => {
      const invoiced   = p.invoices.reduce((s, i) => s + this.n(i.total),      0);
      const collected  = p.invoices.reduce((s, i) => s + this.n(i.amountPaid), 0);
      const { invoices: _inv, ...rest } = p;
      return { ...rest, invoiced, collected };
    });

    return { projects: enriched, total, page, totalPages: Math.ceil(total / limit) };
  }

  async findOne(workspaceId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, workspaceId },
      include: {
        client: { select: { id: true, name: true, company: true, email: true } },
        proposals: {
          orderBy: { createdAt: 'desc' },
          select:  { id: true, title: true, status: true, totalAmount: true, createdAt: true, acceptedAt: true },
        },
        contracts: {
          orderBy: { createdAt: 'desc' },
          select:  { id: true, title: true, status: true, createdAt: true, sentAt: true, signedAt: true },
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
          select:  { id: true, invoiceNumber: true, status: true, total: true, amountPaid: true, dueDate: true, createdAt: true, paidAt: true },
        },
        timeEntries: {
          orderBy: { date: 'desc' },
          select:  { id: true, description: true, date: true, durationMins: true, hourlyRate: true, isBilled: true },
        },
        expenses: {
          orderBy: { date: 'desc' },
          select:  { id: true, description: true, category: true, amount: true, date: true, isBillable: true, isBilled: true },
        },
        _count: { select: { proposals: true, contracts: true, invoices: true, timeEntries: true, expenses: true } },
      },
    });

    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async getStats(workspaceId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, workspaceId },
      include: {
        invoices:    { where: { status: { not: 'DRAFT' } }, select: { status: true, total: true, amountPaid: true } },
        timeEntries: { select: { durationMins: true, hourlyRate: true } },
        expenses:    { select: { amount: true } },
      },
    });

    if (!project) throw new NotFoundException('Project not found');

    const invoiced    = project.invoices.reduce((s, i) => s + this.n(i.total),         0);
    const collected   = project.invoices.reduce((s, i) => s + this.n(i.amountPaid),    0);
    const outstanding = project.invoices
      .filter(i => i.status === 'SENT' || i.status === 'OVERDUE' || i.status === 'VIEWED' || i.status === 'PARTIAL')
      .reduce((s, i) => s + (this.n(i.total) - this.n(i.amountPaid)), 0);
    const totalMins   = project.timeEntries.reduce((s, t) => s + t.durationMins, 0);
    const totalHours  = +(totalMins / 60).toFixed(2);
    const billableValue = project.timeEntries.reduce((s, t) =>
      s + (t.hourlyRate ? (t.durationMins / 60) * this.n(t.hourlyRate) : 0), 0);
    const expenseTotal = project.expenses.reduce((s, e) => s + this.n(e.amount), 0);
    const profit       = collected - expenseTotal;
    const budget       = project.budget ? this.n(project.budget) : null;
    const budgetUsed   = budget ? ((expenseTotal / budget) * 100) : null;

    return {
      invoiced, collected, outstanding,
      totalHours, billableValue,
      expenseTotal, profit,
      budget, budgetUsed,
    };
  }

  async update(workspaceId: string, id: string, dto: UpdateProjectDto) {
    await this.findOne(workspaceId, id);
    return this.prisma.project.update({
      where: { id },
      data:  {
        name:                dto.name,
        description:         dto.description,
        clientId:            dto.clientId,
        status:              dto.status,
        budget:              dto.budget,
        startDate:           dto.startDate ? new Date(dto.startDate) : undefined,
        endDate:             dto.endDate   ? new Date(dto.endDate)   : undefined,
        shareRateWithClient: dto.shareRateWithClient,
      },
      include: {
        client: { select: { id: true, name: true, company: true } },
      },
    });
  }

  async listNotes(workspaceId: string, projectId: string) {
    await this.findOne(workspaceId, projectId);
    return this.prisma.projectNote.findMany({
      where: { projectId, workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createNote(workspaceId: string, projectId: string, content: string) {
    await this.findOne(workspaceId, projectId);
    return this.prisma.projectNote.create({
      data: { workspaceId, projectId, content },
    });
  }

  async deleteNote(workspaceId: string, projectId: string, noteId: string) {
    await this.findOne(workspaceId, projectId);
    await this.prisma.projectNote.deleteMany({ where: { id: noteId, workspaceId, projectId } });
  }

  async archive(workspaceId: string, id: string) {
    const project = await this.findOne(workspaceId, id);
    if (project.archivedAt) throw new BadRequestException('Project is already archived');
    return this.prisma.project.update({ where: { id }, data: { archivedAt: new Date() } });
  }

  async unarchive(workspaceId: string, id: string) {
    const project = await this.findOne(workspaceId, id);
    if (!project.archivedAt) throw new BadRequestException('Project is not archived');
    return this.prisma.project.update({ where: { id }, data: { archivedAt: null } });
  }

  async remove(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id);
    const [tasks, invoices, timeEntries, expenses] = await Promise.all([
      this.prisma.task.count({ where: { projectId: id } }),
      this.prisma.invoice.count({ where: { projectId: id } }),
      this.prisma.timeEntry.count({ where: { projectId: id } }),
      this.prisma.expense.count({ where: { projectId: id } }),
    ]);
    const total = tasks + invoices + timeEntries + expenses;
    if (total > 0) {
      const parts = [
        tasks       && `${tasks} task${tasks > 1 ? 's' : ''}`,
        invoices    && `${invoices} invoice${invoices > 1 ? 's' : ''}`,
        timeEntries && `${timeEntries} time entr${timeEntries > 1 ? 'ies' : 'y'}`,
        expenses    && `${expenses} expense${expenses > 1 ? 's' : ''}`,
      ].filter(Boolean).join(', ');
      throw new BadRequestException(`Cannot delete: this project has ${parts}. Archive instead.`);
    }
    await this.prisma.project.delete({ where: { id } });
  }

  async getProjectPl(
    workspaceId: string,
    projectId: string,
    basis: 'accrual' | 'cash' = 'accrual',
  ) {
    const project = await this.prisma.project.findFirst({
      where:  { id: projectId, workspaceId },
      select: { budget: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    const invoices = await this.prisma.invoice.findMany({
      where: {
        workspaceId,
        projectId,
        ...(basis === 'accrual'
          ? { status: { notIn: [InvoiceStatus.DRAFT, InvoiceStatus.CANCELLED] } }
          : {}),
      },
      select: { subtotal: true, amountPaid: true },
    });

    const expenses = await this.prisma.expense.findMany({
      where:  { workspaceId, projectId },
      select: { amount: true },
    });

    const revenue = invoices.reduce(
      (sum, inv) => sum + (basis === 'accrual' ? this.n(inv.subtotal) : this.n(inv.amountPaid)),
      0,
    );
    const budgetSpent = expenses.reduce((sum, exp) => sum + this.n(exp.amount), 0);
    const grossProfit = revenue - budgetSpent;
    const margin      = revenue > 0
      ? parseFloat(((grossProfit / revenue) * 100).toFixed(1))
      : null;
    const budget          = project.budget ? this.n(project.budget) : null;
    const budgetRemaining = budget !== null ? budget - budgetSpent : null;

    return {
      revenue,
      expenses:        budgetSpent,
      grossProfit,
      margin,
      budget,
      budgetSpent,
      budgetRemaining,
    };
  }
}

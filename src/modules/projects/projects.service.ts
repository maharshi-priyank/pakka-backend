import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectStatus } from '@prisma/client';

export interface CreateProjectDto {
  name:        string;
  description?: string;
  clientId?:   string;
  status?:     ProjectStatus;
  budget?:     number;
  startDate?:  string;
  endDate?:    string;
}

export interface UpdateProjectDto extends Partial<CreateProjectDto> {}

export interface QueryProjectsDto {
  search?:   string;
  status?:   ProjectStatus;
  clientId?: string;
  page?:     number;
  limit?:    number;
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  private n(v: { toString(): string } | null | undefined): number {
    return v ? Number(v.toString()) : 0;
  }

  async create(userId: string, dto: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
        userId,
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

  async findAll(userId: string, query: QueryProjectsDto) {
    const { page = 1, limit = 20, search, status, clientId } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { userId };
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

  async findOne(userId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, userId },
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

  async getStats(userId: string, id: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, userId },
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

  async update(userId: string, id: string, dto: UpdateProjectDto) {
    await this.findOne(userId, id);
    return this.prisma.project.update({
      where: { id },
      data:  {
        name:        dto.name,
        description: dto.description,
        clientId:    dto.clientId,
        status:      dto.status,
        budget:      dto.budget,
        startDate:   dto.startDate ? new Date(dto.startDate) : undefined,
        endDate:     dto.endDate   ? new Date(dto.endDate)   : undefined,
      },
      include: {
        client: { select: { id: true, name: true, company: true } },
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.$transaction([
      this.prisma.proposal.updateMany(   { where: { projectId: id }, data: { projectId: null } }),
      this.prisma.contract.updateMany(   { where: { projectId: id }, data: { projectId: null } }),
      this.prisma.invoice.updateMany(    { where: { projectId: id }, data: { projectId: null } }),
      this.prisma.timeEntry.updateMany(  { where: { projectId: id }, data: { projectId: null } }),
      this.prisma.expense.updateMany(    { where: { projectId: id }, data: { projectId: null } }),
      this.prisma.project.delete({ where: { id } }),
    ]);
  }
}

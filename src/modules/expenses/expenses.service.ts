import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';
import { GstType } from '@prisma/client';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { QueryExpensesDto } from './dto/query-expenses.dto';
import { BillExpensesDto } from './dto/bill-expenses.dto';

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Travel',
  'Accommodation',
  'Food & Entertainment',
  'Materials & Supplies',
  'Equipment',
  'Software & Subscriptions',
  'Contractor / Freelancer Fee',
  'Studio / Venue Hire',
  'Marketing & Ads',
  'Printing & Production',
  'Courier & Shipping',
  'Professional Services',
  'Training & Learning',
  'Office & Admin',
  'Other',
] as const;

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma:   PrismaService,
    private readonly invoices: InvoicesService,
  ) {}

  private readonly projectInclude = {
    client:  { select: { id: true, name: true } },
    project: { select: { id: true, name: true } },
  } as const;

  async create(userId: string, dto: CreateExpenseDto) {
    const expense = await this.prisma.expense.create({
      data: {
        userId,
        clientId:    dto.clientId,
        projectId:   dto.projectId,
        category:    dto.category,
        description: dto.description,
        amount:      dto.amount,
        date:        new Date(dto.date),
        receiptUrl:  dto.receiptUrl,
        isBillable:  dto.isBillable ?? true,
        vendor:      dto.vendor,
        gstRate:     dto.gstRate,
        gstAmount:   dto.gstAmount,
        tdsSection:  dto.tdsSection,
        tdsRate:     dto.tdsRate,
      },
      include: this.projectInclude,
    });

    if (!DEFAULT_EXPENSE_CATEGORIES.includes(dto.category as any)) {
      await this.prisma.userExpenseCategory.upsert({
        where:  { userId_name: { userId, name: dto.category } },
        update: {},
        create: { userId, name: dto.category },
      });
    }

    return expense;
  }

  async findAll(userId: string, query: QueryExpensesDto) {
    const where: {
      userId:      string;
      clientId?:   string;
      projectId?:  string;
      isBillable?: boolean;
      isBilled?:   boolean;
      date?:       { gte?: Date; lte?: Date };
    } = { userId };

    if (query.clientId)           where.clientId   = query.clientId;
    if (query.projectId)          where.projectId  = query.projectId;
    if (query.isBillable != null)  where.isBillable = query.isBillable;
    if (query.isBilled   != null)  where.isBilled   = query.isBilled;
    if (query.from || query.to) {
      where.date = {};
      if (query.from) where.date.gte = new Date(query.from);
      if (query.to)   where.date.lte = new Date(query.to);
    }

    return this.prisma.expense.findMany({
      where,
      orderBy: { date: 'desc' },
      include: this.projectInclude,
    });
  }

  async getCategories(userId: string): Promise<string[]> {
    const custom = await this.prisma.userExpenseCategory.findMany({
      where:   { userId },
      orderBy: { name: 'asc' },
    });
    const customNames = custom.map(c => c.name);
    return [
      ...DEFAULT_EXPENSE_CATEGORIES,
      ...customNames.filter(n => !(DEFAULT_EXPENSE_CATEGORIES as readonly string[]).includes(n)),
    ];
  }

  async exportCsv(userId: string, query: QueryExpensesDto): Promise<string> {
    const expenses = await this.findAll(userId, query);

    const header = [
      'Date', 'Category', 'Vendor', 'Description', 'Amount',
      'GST Rate%', 'GST Amount', 'Net (excl. GST)',
      'TDS Section', 'TDS Rate%', 'Client', 'Project', 'Billable', 'Billed', 'Receipt URL',
    ].join(',');

    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;

    const rows = expenses.map(e => {
      const d = new Date(e.date);
      const date = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
      const amount    = Number(e.amount).toFixed(2);
      const gstRate   = e.gstRate   != null ? Number(e.gstRate).toFixed(2)   : '';
      const gstAmount = e.gstAmount != null ? Number(e.gstAmount).toFixed(2) : '';
      const net       = e.gstAmount != null
        ? (Number(e.amount) - Number(e.gstAmount)).toFixed(2)
        : Number(e.amount).toFixed(2);
      const tdsSection = e.tdsSection ?? '';
      const tdsRate    = e.tdsRate != null ? Number(e.tdsRate).toFixed(2) : '';
      const client     = (e as any).client?.name ?? '';
      const project    = (e as any).project?.name ?? '';

      return [
        date, e.category, e.vendor ?? '', e.description, amount,
        gstRate, gstAmount, net,
        tdsSection, tdsRate, client, project,
        e.isBillable ? 'Yes' : 'No',
        e.isBilled   ? 'Yes' : 'No',
        e.receiptUrl ?? '',
      ].map(v => escape(String(v))).join(',');
    });

    return [header, ...rows].join('\n');
  }

  async update(userId: string, id: string, dto: UpdateExpenseDto) {
    await this.findOwned(userId, id);
    return this.prisma.expense.update({
      where: { id },
      data: {
        ...(dto.clientId    != null && { clientId:    dto.clientId }),
        ...(dto.projectId   != null && { projectId:   dto.projectId }),
        ...(dto.category    != null && { category:    dto.category }),
        ...(dto.description != null && { description: dto.description }),
        ...(dto.amount      != null && { amount:      dto.amount }),
        ...(dto.date        != null && { date:        new Date(dto.date) }),
        ...(dto.receiptUrl  != null && { receiptUrl:  dto.receiptUrl }),
        ...(dto.isBillable  != null && { isBillable:  dto.isBillable }),
        ...(dto.isBilled    != null && { isBilled:    dto.isBilled }),
        ...(dto.invoiceId   != null && { invoiceId:   dto.invoiceId }),
        ...(dto.vendor      != null && { vendor:      dto.vendor }),
        ...(dto.gstRate     != null && { gstRate:     dto.gstRate }),
        ...(dto.gstAmount   != null && { gstAmount:   dto.gstAmount }),
        ...(dto.tdsSection  != null && { tdsSection:  dto.tdsSection }),
        ...(dto.tdsRate     != null && { tdsRate:     dto.tdsRate }),
      },
      include: this.projectInclude,
    });
  }

  async remove(userId: string, id: string) {
    await this.findOwned(userId, id);
    await this.prisma.expense.delete({ where: { id } });
  }

  async billExpenses(userId: string, dto: BillExpensesDto) {
    const expenses = await this.prisma.expense.findMany({
      where: { id: { in: dto.expenseIds }, userId, isBilled: false },
      include: { client: { select: { id: true, name: true } } },
    });

    if (expenses.length === 0) throw new BadRequestException('No unbilled expenses found');
    if (expenses.length !== dto.expenseIds.length) {
      throw new BadRequestException('Some expenses are already billed or do not belong to you');
    }

    const clientIds = [...new Set(expenses.map(e => e.clientId))];
    if (clientIds.length > 1) throw new BadRequestException('All expenses must be for the same client');

    const clientId = clientIds[0] ?? undefined;
    const lineItems = expenses.map(e => ({
      description: `${e.category}: ${e.description}`,
      qty:         1,
      rate:        Number(e.amount),
      gstRate:     0,
    }));

    const invoice = await this.invoices.create(userId, {
      clientId,
      lineItems,
      gstType: GstType.EXEMPT,
    } as any);

    await this.prisma.expense.updateMany({
      where: { id: { in: dto.expenseIds } },
      data:  { isBilled: true, invoiceId: invoice.id },
    });

    return invoice;
  }

  private async findOwned(userId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id, userId } });
    if (!expense) throw new NotFoundException('Expense not found');
    return expense;
  }
}

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';
import { GstType } from '@prisma/client';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { QueryExpensesDto } from './dto/query-expenses.dto';
import { BillExpensesDto } from './dto/bill-expenses.dto';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma:   PrismaService,
    private readonly invoices: InvoicesService,
  ) {}

  async create(userId: string, dto: CreateExpenseDto) {
    return this.prisma.expense.create({
      data: {
        userId,
        clientId:    dto.clientId,
        category:    dto.category,
        description: dto.description,
        amount:      dto.amount,
        date:        new Date(dto.date),
        receiptUrl:  dto.receiptUrl,
        isBillable:  dto.isBillable ?? true,
      },
      include: { client: { select: { id: true, name: true } } },
    });
  }

  async findAll(userId: string, query: QueryExpensesDto) {
    const where: {
      userId:     string;
      clientId?:  string;
      isBillable?: boolean;
      isBilled?:  boolean;
      date?:      { gte?: Date; lte?: Date };
    } = { userId };

    if (query.clientId)           where.clientId   = query.clientId;
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
      include: { client: { select: { id: true, name: true } } },
    });
  }

  async update(userId: string, id: string, dto: UpdateExpenseDto) {
    await this.findOwned(userId, id);
    return this.prisma.expense.update({
      where: { id },
      data: {
        ...(dto.clientId    != null && { clientId: dto.clientId }),
        ...(dto.category    != null && { category: dto.category }),
        ...(dto.description != null && { description: dto.description }),
        ...(dto.amount      != null && { amount: dto.amount }),
        ...(dto.date        != null && { date: new Date(dto.date) }),
        ...(dto.receiptUrl  != null && { receiptUrl: dto.receiptUrl }),
        ...(dto.isBillable  != null && { isBillable: dto.isBillable }),
        ...(dto.isBilled    != null && { isBilled: dto.isBilled }),
        ...(dto.invoiceId   != null && { invoiceId: dto.invoiceId }),
      },
      include: { client: { select: { id: true, name: true } } },
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

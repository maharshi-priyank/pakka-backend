import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { GstType, InvoiceStatus } from '@prisma/client';
import { CreateInvoiceDto, LineItemDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { QueryInvoicesDto } from './dto/query-invoices.dto';

const INCLUDE_FULL = {
  contract:     { select: { id: true, title: true } },
  client:       true,
  deliverables: true,
} as const;

const INCLUDE_LIST = {
  client:   { select: { id: true, name: true, company: true } },
  contract: { select: { id: true, title: true } },
} as const;

function calcTotals(lineItems: LineItemDto[], gstType: GstType) {
  let subtotal = 0;
  let gstAmount = 0;

  for (const item of lineItems) {
    const lineTotal = item.qty * item.rate;
    subtotal += lineTotal;
    if (gstType !== GstType.EXEMPT) {
      gstAmount += (lineTotal * item.gstRate) / 100;
    }
  }

  return {
    subtotal:  parseFloat(subtotal.toFixed(2)),
    gstAmount: parseFloat(gstAmount.toFixed(2)),
    total:     parseFloat((subtotal + gstAmount).toFixed(2)),
  };
}

async function generateInvoiceNumber(prisma: PrismaService, userId: string): Promise<string> {
  const year = new Date().getFullYear();
  const latest = await prisma.invoice.findFirst({
    where: { userId, invoiceNumber: { startsWith: `INV-${year}-` } },
    orderBy: { createdAt: 'desc' },
  });

  let seq = 1;
  if (latest) {
    const parts = latest.invoiceNumber.split('-');
    const last = parseInt(parts[2] ?? '0', 10);
    seq = isNaN(last) ? 1 : last + 1;
  }

  return `INV-${year}-${String(seq).padStart(3, '0')}`;
}

type InvoiceCreateData = Omit<Parameters<PrismaService['invoice']['create']>[0]['data'], 'invoiceNumber'>

async function createInvoiceWithRetry(
  prisma: PrismaService,
  userId: string,
  data: InvoiceCreateData,
  include: Parameters<PrismaService['invoice']['create']>[0]['include'],
  maxRetries = 5,
) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const invoiceNumber = await generateInvoiceNumber(prisma, userId);
    try {
      return await prisma.invoice.create({ data: { ...data, invoiceNumber } as Parameters<PrismaService['invoice']['create']>[0]['data'], include });
    } catch (err: unknown) {
      const isUniqueViolation = (err as { code?: string }).code === 'P2002';
      if (!isUniqueViolation || attempt === maxRetries - 1) throw err;
    }
  }
  throw new Error('Failed to generate unique invoice number after retries');
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma:        PrismaService,
    private readonly eventEmitter:  EventEmitter2,
  ) {}

  private computeNextRecurrenceDate(from: Date, cycle: string, day: number): Date {
    const next = new Date(from)
    if (cycle === 'WEEKLY')    next.setDate(next.getDate() + 7)
    if (cycle === 'MONTHLY')   next.setMonth(next.getMonth() + 1)
    if (cycle === 'QUARTERLY') next.setMonth(next.getMonth() + 3)
    if (cycle === 'YEARLY')    next.setFullYear(next.getFullYear() + 1)
    // clamp day to last day of the computed month (handles Feb 28, etc.)
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
    next.setDate(Math.min(day, lastDay))
    return next
  }

  async create(userId: string, dto: CreateInvoiceDto) {
    const gstType = dto.gstType ?? GstType.IGST;
    const { subtotal, gstAmount, total } = calcTotals(dto.lineItems, gstType);

    const now = new Date()
    const recurrenceNextDate =
      dto.isRecurring && dto.recurrenceCycle && dto.recurrenceDay
        ? this.computeNextRecurrenceDate(now, dto.recurrenceCycle, dto.recurrenceDay)
        : null

    return createInvoiceWithRetry(this.prisma, userId, {
      userId,
      contractId:        dto.contractId,
      clientId:          dto.clientId,
      lineItems:         dto.lineItems as object[],
      subtotal,
      gstAmount,
      total,
      gstType,
      tdsRate:           dto.tdsRate  != null ? dto.tdsRate  : null,
      dueDate:           dto.dueDate  ? new Date(dto.dueDate)  : null,
      isRecurring:       dto.isRecurring        ?? false,
      recurrenceCycle:   dto.recurrenceCycle    ?? null,
      recurrenceDay:     dto.recurrenceDay      ?? null,
      recurrenceEndDate: dto.recurrenceEndDate  ? new Date(dto.recurrenceEndDate) : null,
      recurrenceNextDate,
    }, INCLUDE_FULL);
  }

  async generateRecurringDrafts(): Promise<void> {
    const now = new Date()
    const due = await this.prisma.invoice.findMany({
      where: {
        isRecurring:        true,
        recurrenceNextDate: { lte: now },
        status:             { notIn: ['CANCELLED'] },
        OR: [{ recurrenceEndDate: null }, { recurrenceEndDate: { gte: now } }],
      },
    })

    for (const inv of due) {
      if (!inv.recurrenceCycle || !inv.recurrenceDay) continue
      const nextDate = this.computeNextRecurrenceDate(now, inv.recurrenceCycle, inv.recurrenceDay)

      await createInvoiceWithRetry(this.prisma, inv.userId, {
        userId:            inv.userId,
        contractId:        inv.contractId    ?? undefined,
        clientId:          inv.clientId      ?? undefined,
        lineItems:         inv.lineItems     as object[],
        subtotal:          inv.subtotal,
        gstAmount:         inv.gstAmount,
        total:             inv.total,
        gstType:           inv.gstType,
        tdsRate:           inv.tdsRate       ?? null,
        isRecurring:       true,
        recurrenceCycle:   inv.recurrenceCycle,
        recurrenceDay:     inv.recurrenceDay,
        recurrenceEndDate: inv.recurrenceEndDate  ?? null,
        recurrenceNextDate: nextDate,
        parentInvoiceId:   inv.id,
      }, null)

      await this.prisma.invoice.update({
        where: { id: inv.id },
        data:  { recurrenceNextDate: nextDate },
      })
    }
  }

  async markOverdueInvoices(): Promise<void> {
    await this.prisma.invoice.updateMany({
      where: {
        status:  { in: ['SENT', 'VIEWED'] },
        dueDate: { lt: new Date() },
        amountPaid: 0,
      },
      data: { status: 'OVERDUE' },
    })
  }

  async createFromContract(userId: string, contractId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, userId },
      include: { client: true },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.status !== 'SIGNED') {
      throw new BadRequestException('Invoice can only be created from a signed contract');
    }

    const existing = await this.prisma.invoice.findMany({ where: { contractId } });
    if (existing.length > 0) return existing;

    const content         = contract.content as Record<string, unknown>;
    const paymentSchedule = (content.paymentSchedule as Array<{ milestone: string; amount: number }> | undefined) ?? [];
    const gstType         = (content.gstType    as GstType | undefined) ?? GstType.IGST;
    const totalAmount     = (content.totalAmount as number  | undefined) ?? 0;
    const contractGst     = (content.gstAmount   as number  | undefined) ?? 0;
    const tdsRate         = (content.tdsRate     as number  | undefined) ?? null;

    if (paymentSchedule.length > 0) {
      // One DRAFT invoice per milestone, each with correct gstType and proportional GST
      const subtotalBase   = totalAmount - contractGst;
      const effectiveGstRate = subtotalBase > 0
        ? parseFloat(((contractGst / subtotalBase) * 100).toFixed(4))
        : 0;

      const invoices = [];
      for (const ps of paymentSchedule) {
        const lineItems: LineItemDto[] = [{ description: ps.milestone, qty: 1, rate: ps.amount, gstRate: effectiveGstRate }];
        const totals = calcTotals(lineItems, gstType);

        const inv = await createInvoiceWithRetry(this.prisma, userId, {
          userId,
          contractId,
          clientId:  contract.clientId,
          lineItems: lineItems as object[],
          subtotal:  totals.subtotal,
          gstAmount: totals.gstAmount,
          total:     totals.total,
          gstType,
          tdsRate,
        }, INCLUDE_FULL);
        invoices.push(inv);
      }
      return invoices;
    }

    // No payment schedule — single invoice for the full contract amount
    const gstRateSingle = (totalAmount - contractGst) > 0
      ? parseFloat(((contractGst / (totalAmount - contractGst)) * 100).toFixed(4))
      : 0;
    const lineItems: LineItemDto[] = [{ description: contract.title, qty: 1, rate: totalAmount - contractGst, gstRate: gstRateSingle }];
    const totals = calcTotals(lineItems, gstType);

    const inv = await createInvoiceWithRetry(this.prisma, userId, {
      userId,
      contractId,
      clientId:  contract.clientId,
      lineItems: lineItems as object[],
      subtotal:  totals.subtotal,
      gstAmount: totals.gstAmount,
      total:     totals.total,
      gstType,
      tdsRate,
    }, INCLUDE_FULL);
    return [inv];
  }

  async findAll(userId: string, dto: QueryInvoicesDto) {
    const limit = dto.limit ?? 50;
    const page  = dto.page  ?? 1;
    const skip  = (page - 1) * limit;

    const where = {
      userId,
      ...(dto.status ? { status: dto.status } : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where, skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: INCLUDE_LIST,
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findById(userId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, userId },
      include: INCLUDE_FULL,
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async update(userId: string, id: string, dto: UpdateInvoiceDto) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, userId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.PAID) {
      throw new ForbiddenException('Cannot edit a paid invoice');
    }

    const gstType    = dto.gstType   ?? invoice.gstType;
    const lineItems  = dto.lineItems ?? (invoice.lineItems as unknown as LineItemDto[]);
    const { subtotal, gstAmount, total } = calcTotals(lineItems, gstType);

    return this.prisma.invoice.update({
      where: { id },
      data: {
        lineItems:  dto.lineItems ? dto.lineItems as object[] : undefined,
        subtotal,
        gstAmount,
        total,
        gstType,
        tdsRate:    dto.tdsRate  != null ? dto.tdsRate  : undefined,
        dueDate:    dto.dueDate  ? new Date(dto.dueDate)  : undefined,
        clientId:   dto.clientId,
        contractId: dto.contractId,
      },
      include: INCLUDE_FULL,
    });
  }

  async send(userId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, userId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Only draft invoices can be sent');
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.SENT },
      include: INCLUDE_FULL,
    });

    this.eventEmitter.emit('invoice.sent', { entityId: id, userId });
    const appUrl = process.env.APP_URL ?? 'http://localhost:5175';
    return { invoice: updated, viewUrl: `${appUrl}/invoice/${updated.id}` };
  }

  async findByIdPublic(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        client:       true,
        deliverables: true,
        user:         { select: { name: true, businessName: true, email: true, logoUrl: true, gstNumber: true, plan: true, bankName: true, bankAccountName: true, bankAccountNumber: true, bankIfsc: true, upiId: true, upiQrUrl: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    const isPaid = invoice.status === InvoiceStatus.PAID;
    return {
      ...invoice,
      deliverables: invoice.deliverables.map(d => ({
        id:       d.id,
        fileName: d.fileName,
        fileSize: d.fileSize,
        mimeType: d.mimeType,
        fileUrl:  isPaid ? d.fileUrl : null,
      })),
    };
  }

  async markPaid(userId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, userId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already marked as paid');
    }

    const paid = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.PAID, amountPaid: invoice.total, paidAt: new Date() },
      include: INCLUDE_FULL,
    });
    this.eventEmitter.emit('invoice.paid', { entityId: id, userId });
    return paid;
  }

  async recordPartialPayment(userId: string, id: string, amountReceived: number) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, userId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already fully paid');
    }

    const newAmountPaid = parseFloat((Number(invoice.amountPaid) + amountReceived).toFixed(2));
    const total         = Number(invoice.total);

    if (newAmountPaid >= total) {
      const paid = await this.prisma.invoice.update({
        where: { id },
        data:  { status: InvoiceStatus.PAID, amountPaid: total, paidAt: new Date() },
        include: INCLUDE_FULL,
      });
      this.eventEmitter.emit('invoice.paid', { entityId: id, userId });
      return paid;
    }

    const partial = await this.prisma.invoice.update({
      where: { id },
      data:  { status: InvoiceStatus.PARTIAL, amountPaid: newAmountPaid },
      include: INCLUDE_FULL,
    });
    this.eventEmitter.emit('invoice.partial', { entityId: id, userId, amountPaid: newAmountPaid });
    return partial;
  }

  async recordPayment(userId: string, id: string, dto: { amountReceived: number; tdsDeducted: number; note?: string }) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, userId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already fully paid');
    }

    const total         = Number(invoice.total);
    const alreadyPaid   = Number(invoice.amountPaid);
    const newAmountPaid = parseFloat((alreadyPaid + dto.amountReceived + dto.tdsDeducted).toFixed(2));
    const newTds        = parseFloat((Number(invoice.tdsDeducted) + dto.tdsDeducted).toFixed(2));

    if (newAmountPaid >= total) {
      const paid = await this.prisma.invoice.update({
        where: { id },
        data:  { status: InvoiceStatus.PAID, amountPaid: total, tdsDeducted: newTds, paidAt: new Date() },
        include: INCLUDE_FULL,
      });
      this.eventEmitter.emit('invoice.paid', { entityId: id, userId });
      return paid;
    }

    const partial = await this.prisma.invoice.update({
      where: { id },
      data:  { status: InvoiceStatus.PARTIAL, amountPaid: newAmountPaid, tdsDeducted: newTds },
      include: INCLUDE_FULL,
    });
    this.eventEmitter.emit('invoice.partial', { entityId: id, userId, amountPaid: newAmountPaid });
    return partial;
  }

  async markOverdue(userId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, userId } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const overdue = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.OVERDUE },
      include: INCLUDE_FULL,
    });
    this.eventEmitter.emit('invoice.overdue', { entityId: id, userId });
    return overdue;
  }

  // ── Deliverables ──────────────────────────────────────────────────────────

  async addDeliverable(userId: string, invoiceId: string, dto: { fileName: string; fileUrl: string; fileSize: number; mimeType: string }) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, userId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.CANCELLED) throw new BadRequestException('Cannot add deliverables to a cancelled invoice');
    return this.prisma.deliverable.create({ data: { userId, invoiceId, ...dto } });
  }

  async listDeliverables(userId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, userId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return this.prisma.deliverable.findMany({ where: { invoiceId }, orderBy: { createdAt: 'asc' } });
  }

  async deleteDeliverable(userId: string, invoiceId: string, delivId: string) {
    const deliverable = await this.prisma.deliverable.findFirst({ where: { id: delivId, invoiceId, userId } });
    if (!deliverable) throw new NotFoundException('Deliverable not found');
    await this.prisma.deliverable.delete({ where: { id: delivId } });
    return { success: true };
  }

  async delete(userId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, userId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.PAID) {
      throw new ForbiddenException('Cannot delete a paid invoice');
    }

    await this.prisma.invoice.delete({ where: { id } });
    return { success: true };
  }
}

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
  contract: { select: { id: true, title: true } },
  client:   true,
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

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma:        PrismaService,
    private readonly eventEmitter:  EventEmitter2,
  ) {}

  async create(userId: string, dto: CreateInvoiceDto) {
    const gstType = dto.gstType ?? GstType.IGST;
    const { subtotal, gstAmount, total } = calcTotals(dto.lineItems, gstType);
    const invoiceNumber = await generateInvoiceNumber(this.prisma, userId);

    return this.prisma.invoice.create({
      data: {
        userId,
        contractId: dto.contractId,
        clientId:   dto.clientId,
        invoiceNumber,
        lineItems: dto.lineItems as object[],
        subtotal,
        gstAmount,
        total,
        gstType,
        tdsRate:  dto.tdsRate  != null ? dto.tdsRate  : null,
        dueDate:  dto.dueDate  ? new Date(dto.dueDate)  : null,
      },
      include: INCLUDE_FULL,
    });
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

    const content = contract.content as Record<string, unknown>;
    const paymentSchedule = (content.paymentSchedule as Array<{ milestone: string; amount: number }> | undefined) ?? [];
    const gstType       = (content.gstType    as GstType | undefined) ?? GstType.IGST;
    const totalAmount   = (content.totalAmount as number  | undefined) ?? 0;
    const contractGst   = (content.gstAmount   as number  | undefined) ?? 0;

    const lineItems: LineItemDto[] = paymentSchedule.length > 0
      ? paymentSchedule.map(ps => ({ description: ps.milestone, qty: 1, rate: ps.amount, gstRate: 0 }))
      : [{ description: contract.title, qty: 1, rate: totalAmount - contractGst, gstRate: 18 }];

    const gstTypeForCalc = paymentSchedule.length > 0 ? GstType.EXEMPT : gstType;
    const totals = paymentSchedule.length > 0
      ? {
          subtotal:  parseFloat((totalAmount - contractGst).toFixed(2)),
          gstAmount: parseFloat(contractGst.toFixed(2)),
          total:     parseFloat(totalAmount.toFixed(2)),
        }
      : calcTotals(lineItems, gstType);

    const invoiceNumber = await generateInvoiceNumber(this.prisma, userId);

    return this.prisma.invoice.create({
      data: {
        userId,
        contractId,
        clientId:  contract.clientId,
        invoiceNumber,
        lineItems: lineItems as object[],
        subtotal:  totals.subtotal,
        gstAmount: totals.gstAmount,
        total:     totals.total,
        gstType:   gstTypeForCalc,
      },
      include: INCLUDE_FULL,
    });
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
        client: true,
        user:   { select: { name: true, businessName: true, email: true, logoUrl: true, gstNumber: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async markPaid(userId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, userId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already marked as paid');
    }

    const paid = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.PAID, paidAt: new Date() },
      include: INCLUDE_FULL,
    });
    this.eventEmitter.emit('invoice.paid', { entityId: id, userId });
    return paid;
  }

  async markOverdue(userId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, userId } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    return this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.OVERDUE },
      include: INCLUDE_FULL,
    });
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

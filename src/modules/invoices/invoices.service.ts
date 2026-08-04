import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { GstType, InvoiceStatus } from '@prisma/client';
import { CreateInvoiceDto, LineItemDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { QueryInvoicesDto } from './dto/query-invoices.dto';
import { ReapplyTemplateDto } from './dto/reapply-template.dto';
import { effectivePlan } from '../users/effective-plan';
import { resolveDocumentCurrency } from '../shared/resolve-document-currency';
import { InvoiceTemplatesService } from '../invoice-templates/invoice-templates.service';

const INCLUDE_FULL = {
  contract: { select: { id: true, title: true } },
  client:   true,
  contact:  { select: { id: true, name: true, company: true } },
} as const;

const INCLUDE_LIST = {
  client:   { select: { id: true, name: true, company: true } },
  contact:  { select: { id: true, name: true, company: true } },
  contract: { select: { id: true, title: true } },
  project:  { select: { id: true, name: true } },
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

async function generateInvoiceNumber(prisma: PrismaService, workspaceId: string): Promise<string> {
  const year = new Date().getFullYear();
  const latest = await prisma.invoice.findFirst({
    where: { workspaceId, invoiceNumber: { startsWith: `INV-${year}-` } },
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
  workspaceId: string,
  data: InvoiceCreateData,
  include: Parameters<PrismaService['invoice']['create']>[0]['include'],
  maxRetries = 5,
) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const invoiceNumber = await generateInvoiceNumber(prisma, workspaceId);
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
    private readonly prisma:           PrismaService,
    private readonly eventEmitter:     EventEmitter2,
    private readonly invoiceTemplates: InvoiceTemplatesService,
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

  async create(workspaceId: string, dto: CreateInvoiceDto) {
    // R5/R7/R8/KTD1: resolve via the shared helper — unchanged for callers that
    // already send dto.currency (the helper's first resolution step), newly
    // correct for a contactId-linked Invoice created without an explicit currency.
    const { currency, isExport } = await resolveDocumentCurrency({
      prisma: this.prisma,
      workspaceId,
      contactId: dto.contactId,
      requestedCurrency: dto.currency,
    });

    // For export invoices, force EXEMPT so calcTotals skips GST entirely
    const gstType = isExport ? GstType.EXEMPT : (dto.gstType ?? GstType.IGST);
    const { subtotal, gstAmount, total } = calcTotals(dto.lineItems, gstType);

    // Copy lutNumber from user profile if not supplied on the invoice
    let lutNumber = dto.lutNumber ?? null;
    if (isExport && !lutNumber) {
      const user = await this.prisma.user.findUnique({
        where: { id: workspaceId },
        select: { defaultLutNumber: true },
      });
      lutNumber = user?.defaultLutNumber ?? null;
    }

    const now = new Date();
    const recurrenceNextDate =
      dto.isRecurring && dto.recurrenceCycle && dto.recurrenceDay
        ? this.computeNextRecurrenceDate(now, dto.recurrenceCycle, dto.recurrenceDay)
        : null;

    return createInvoiceWithRetry(this.prisma, workspaceId, {
      workspaceId,
      contractId:        dto.contractId,
      clientId:          dto.clientId,
      contactId:         dto.contactId,
      lineItems:         dto.lineItems as object[],
      subtotal,
      gstAmount,
      total,
      gstType,
      tdsRate:           dto.tdsRate  != null ? dto.tdsRate  : null,
      // KTD6: notes was declared on the DTO but silently dropped -- persist it
      // like any other optional string field (mirrors tdsRate's null-coalesce above).
      notes:             dto.notes    != null ? dto.notes    : null,
      dueDate:           dto.dueDate  ? new Date(dto.dueDate)  : null,
      currency,
      exchangeRate:      dto.exchangeRate ?? null,
      lutNumber,
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

      await createInvoiceWithRetry(this.prisma, inv.workspaceId, {
        workspaceId:       inv.workspaceId,
        contractId:        inv.contractId    ?? undefined,
        clientId:          inv.clientId      ?? undefined,
        contactId:         inv.contactId     ?? undefined,
        projectId:         inv.projectId     ?? undefined,
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

  async createFromContract(workspaceId: string, contractId: string) {
    const contract = await this.prisma.contract.findFirst({
      where: { id: contractId, workspaceId },
      include: { client: true, contact: { select: { id: true } } },
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
    // KTD6: use the Contract's currency as signed, not a fresh Contact/Workspace
    // lookup — the '?? INR' floor exists only for pre-U6 Contracts (currency: null).
    const currency        = contract.currency ?? 'INR';

    // KTD3/KTD6: read the default live off the template table (no AutomationRule
    // involvement); the default Invoice template's `notes` text is this Invoice's
    // boilerplate slot, the same role Contract's clauses play for KTD5 -- but
    // unlike Contract's clauses there's no pre-existing hardcoded fallback here,
    // so `null` when no default template exists yet is not a regression.
    const defaultTemplate = await this.invoiceTemplates.getDefault(workspaceId);
    const notes = (defaultTemplate?.content as { notes?: string } | undefined)?.notes ?? null;

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

        const inv = await createInvoiceWithRetry(this.prisma, workspaceId, {
          workspaceId,
          contractId,
          clientId:  contract.clientId,
          contactId: contract.contact?.id ?? undefined,
          projectId: contract.projectId ?? undefined,
          lineItems: lineItems as object[],
          subtotal:  totals.subtotal,
          gstAmount: totals.gstAmount,
          total:     totals.total,
          gstType,
          tdsRate,
          currency,
          notes, // KTD6: same default-template notes applied to every milestone invoice
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

    const inv = await createInvoiceWithRetry(this.prisma, workspaceId, {
      workspaceId,
      contractId,
      clientId:  contract.clientId,
      contactId: contract.contact?.id ?? undefined,
      projectId: contract.projectId ?? undefined,
      lineItems: lineItems as object[],
      subtotal:  totals.subtotal,
      gstAmount: totals.gstAmount,
      total:     totals.total,
      gstType,
      tdsRate,
      currency,
      notes,
    }, INCLUDE_FULL);
    return [inv];
  }

  async findAll(workspaceId: string, dto: QueryInvoicesDto) {
    const limit = dto.limit ?? 50;
    const page  = dto.page  ?? 1;
    const skip  = (page - 1) * limit;

    const where = {
      workspaceId,
      ...(dto.status    ? { status:    dto.status    } : {}),
      ...(dto.clientId  ? { clientId:  dto.clientId  } : {}),
      ...(dto.contactId ? { contactId: dto.contactId } : {}),
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

  async findById(workspaceId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, workspaceId },
      include: INCLUDE_FULL,
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async update(workspaceId: string, id: string, dto: UpdateInvoiceDto) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, workspaceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.PAID) {
      throw new ForbiddenException('Cannot edit a paid invoice');
    }

    // review-fix: mirrors Proposal/Contract's update() -- only re-resolve
    // currency when this update could plausibly affect it (contactId or
    // currency changing). Resolved using dto.contactId when present, else the
    // Invoice's existing contactId -- a contactId reassignment in the same
    // call must resolve against the NEW contact, not the old one. Previously
    // Invoice.update() never touched currency at all, so reassigning an
    // Invoice to a different Contact left it permanently on whatever currency
    // it was created with (unlike Proposal/Contract, which already resolved
    // this on every contactId/currency change).
    const touchesCurrency = dto.contactId !== undefined || dto.currency !== undefined;
    let currency: string | undefined;
    let isExportOverride = false;
    if (touchesCurrency) {
      const contactId = dto.contactId !== undefined ? dto.contactId : invoice.contactId;
      const resolved = await resolveDocumentCurrency({
        prisma: this.prisma,
        workspaceId,
        contactId,
        requestedCurrency: dto.currency,
      });
      currency = resolved.currency;
      isExportOverride = resolved.isExport;
    }

    // A client-submitted gstType (or the previously-persisted one) is honored
    // only when the resolved currency is INR -- otherwise EXEMPT is enforced,
    // same as Proposal/Contract. When this update doesn't touch currency at
    // all, behavior is unchanged from before this fix.
    const gstType    = isExportOverride ? GstType.EXEMPT : (dto.gstType ?? invoice.gstType);
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
        // KTD6: mirrors tdsRate above -- omitted (undefined) when not sent, so an
        // update that doesn't touch notes leaves the persisted value untouched.
        notes:      dto.notes    != null ? dto.notes    : undefined,
        dueDate:    dto.dueDate  ? new Date(dto.dueDate)  : undefined,
        clientId:   dto.clientId,
        contactId:  dto.contactId,
        contractId: dto.contractId,
        ...(dto.projectId !== undefined && { projectId: dto.projectId ?? null }),
        ...(currency !== undefined && { currency }),
      },
      include: INCLUDE_FULL,
    });
  }

  // U8/R8/R9/KTD7: mirrors update()'s own PAID guard above — re-apply is only
  // blocked once an Invoice is fully PAID, unlike Contract's SIGNED/VOID guard.
  async reapplyTemplate(workspaceId: string, id: string, dto: ReapplyTemplateDto) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, workspaceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.PAID) {
      throw new ForbiddenException('Cannot re-apply a template to a paid invoice');
    }

    // KTD1: workspace-scoped lookup — never a bare
    // prisma.invoiceTemplate.findUnique({ where: { id } }), which would let a
    // templateId from another workspace leak that workspace's template
    // content into this Invoice (findOne() throws NotFoundException in that case).
    const template = await this.invoiceTemplates.findOne(workspaceId, dto.templateId);
    const notes = (template.content as { notes?: string } | undefined)?.notes ?? null;

    // R9: only notes (the boilerplate slot) changes — lineItems, amounts, and
    // status are left completely untouched.
    return this.prisma.invoice.update({
      where: { id },
      data:  { notes },
      include: INCLUDE_FULL,
    });
  }

  async send(workspaceId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, workspaceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Only draft invoices can be sent');
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.SENT },
      include: INCLUDE_FULL,
    });

    this.eventEmitter.emit('invoice.sent', { entityId: id, workspaceId });
    const appUrl = process.env.APP_URL ?? 'http://localhost:5175';
    return { invoice: updated, viewUrl: `${appUrl}/invoice/${updated.id}` };
  }

  async findByIdPublic(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        client:    true,
        workspace: { select: { name: true, businessName: true, logoUrl: true, gstNumber: true, bankName: true, bankAccountName: true, bankAccountNumber: true, bankIfsc: true, upiId: true, upiQrUrl: true, country: true, taxLabel: true, ibanNumber: true, swiftCode: true, routingNumber: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    // R13/R14: a client viewing the public page transitions SENT/OVERDUE -> VIEWED.
    // Atomic conditional updateMany (not read-then-write) so a concurrent payment
    // confirmation can't be clobbered back to VIEWED (KTD9).
    const { count } = await this.prisma.invoice.updateMany({
      where: { id, status: { in: [InvoiceStatus.SENT, InvoiceStatus.OVERDUE] } },
      data:  { status: InvoiceStatus.VIEWED },
    });
    if (count > 0) invoice.status = InvoiceStatus.VIEWED;

    const owner = await this.prisma.user.findUnique({
      where: { id: invoice.workspaceId },
      select: { email: true, plan: true, planExpiresAt: true, subscriptionStatus: true },
    });
    const hideBranding = effectivePlan(owner!) === 'STUDIO';
    const userPublic = { ...invoice.workspace, email: owner?.email ?? null };
    return { ...invoice, user: userPublic, hideBranding };
  }

  async markPaid(workspaceId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, workspaceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.PAID) {
      throw new BadRequestException('Invoice is already marked as paid');
    }

    const paid = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.PAID, amountPaid: invoice.total, paidAt: new Date() },
      include: INCLUDE_FULL,
    });
    this.eventEmitter.emit('invoice.paid', { entityId: id, workspaceId });
    return paid;
  }

  async recordPartialPayment(workspaceId: string, id: string, amountReceived: number) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, workspaceId } });
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
      this.eventEmitter.emit('invoice.paid', { entityId: id, workspaceId });
      return paid;
    }

    const partial = await this.prisma.invoice.update({
      where: { id },
      data:  { status: InvoiceStatus.PARTIAL, amountPaid: newAmountPaid },
      include: INCLUDE_FULL,
    });
    this.eventEmitter.emit('invoice.partial', { entityId: id, workspaceId, amountPaid: newAmountPaid });
    return partial;
  }

  async recordPayment(workspaceId: string, id: string, dto: { amountReceived: number; tdsDeducted: number; note?: string }) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, workspaceId } });
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
      this.eventEmitter.emit('invoice.paid', { entityId: id, workspaceId });
      return paid;
    }

    const partial = await this.prisma.invoice.update({
      where: { id },
      data:  { status: InvoiceStatus.PARTIAL, amountPaid: newAmountPaid, tdsDeducted: newTds },
      include: INCLUDE_FULL,
    });
    this.eventEmitter.emit('invoice.partial', { entityId: id, workspaceId, amountPaid: newAmountPaid });
    return partial;
  }

  async markOverdue(workspaceId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, workspaceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const overdue = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.OVERDUE },
      include: INCLUDE_FULL,
    });
    this.eventEmitter.emit('invoice.overdue', { entityId: id, workspaceId });
    return overdue;
  }

  async void(workspaceId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, workspaceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.DRAFT) {
      throw new BadRequestException('Draft invoices cannot be voided — delete them instead');
    }
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Invoice is already voided');
    }
    return this.prisma.invoice.update({ where: { id }, data: { status: InvoiceStatus.CANCELLED } });
  }

  async delete(workspaceId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, workspaceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Only draft invoices can be deleted — void non-draft invoices instead');
    }

    await this.prisma.invoice.delete({ where: { id } });
    return { success: true };
  }
}

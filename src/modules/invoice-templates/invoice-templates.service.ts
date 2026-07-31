import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import Decimal from 'decimal.js';
import type { InvoiceTemplate } from '@prisma/client';
import { DEFAULT_INVOICE_CONTENT } from './default-content';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { FromInvoiceDto } from './dto/from-invoice.dto';

// U3/KTD2: unlike proposal-templates.service.ts, there is no SYSTEM_TEMPLATES
// virtual-constant merge here — the seeded "system-default" row (seedDefault())
// is a real InvoiceTemplate row per workspace, so list()/findOne() read only
// real rows.
@Injectable()
export class InvoiceTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(template: InvoiceTemplate) {
    return { ...template, totalAmount: Number(template.totalAmount) };
  }

  async list(workspaceId: string) {
    const templates = await this.prisma.invoiceTemplate.findMany({
      where:   { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return templates.map((t) => this.serialize(t));
  }

  async findOne(workspaceId: string, id: string) {
    const template = await this.prisma.invoiceTemplate.findFirst({ where: { id, workspaceId } });
    if (!template) throw new NotFoundException('Template not found');
    return this.serialize(template);
  }

  async create(workspaceId: string, dto: CreateTemplateDto) {
    const template = await this.prisma.invoiceTemplate.create({
      data: {
        workspaceId,
        name:        dto.name,
        description: dto.description,
        category:    dto.category,
        content:     dto.content as object,
        totalAmount: dto.totalAmount ? new Decimal(dto.totalAmount) : new Decimal(0),
      },
    });
    return this.serialize(template);
  }

  async update(workspaceId: string, id: string, dto: UpdateTemplateDto) {
    const template = await this.prisma.invoiceTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');
    if (template.workspaceId !== workspaceId) throw new ForbiddenException();

    const updated = await this.prisma.invoiceTemplate.update({
      where: { id },
      data: {
        ...(dto.name        !== undefined ? { name:        dto.name }                    : {}),
        ...(dto.description !== undefined ? { description: dto.description }             : {}),
        ...(dto.category    !== undefined ? { category:    dto.category }                : {}),
        ...(dto.content     !== undefined ? { content:     dto.content as object }       : {}),
        ...(dto.totalAmount !== undefined ? { totalAmount: new Decimal(dto.totalAmount) } : {}),
      },
    });
    return this.serialize(updated);
  }

  // KTD10: a workspace must always have exactly one default template and
  // never zero templates for the document type — the seeded system template
  // is never deletable, and neither is the current default (even when it's
  // not the system template), so a member must reassign the default (or rely
  // on the always-present system row) before a default can ever be removed.
  async remove(workspaceId: string, id: string) {
    const template = await this.prisma.invoiceTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');
    if (template.workspaceId !== workspaceId) throw new ForbiddenException();

    if (template.isSystem) {
      throw new BadRequestException('System templates cannot be deleted');
    }
    if (template.isDefault) {
      throw new BadRequestException('Cannot delete the current default template — set a different template as default first');
    }

    await this.prisma.invoiceTemplate.delete({ where: { id } });
    return { success: true };
  }

  async fromInvoice(workspaceId: string, invoiceId: string, dto: FromInvoiceDto) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, workspaceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const template = await this.prisma.invoiceTemplate.create({
      data: {
        workspaceId,
        name:        dto.name,
        description: dto.description,
        category:    dto.category,
        // KTD6: content is { notes, lineItems? } — notes is the boilerplate
        // field, lineItems a from-scratch starting point only.
        content:     { notes: invoice.notes ?? '', lineItems: invoice.lineItems } as object,
        totalAmount: invoice.total,
      },
    });
    return this.serialize(template);
  }

  async incrementUsage(workspaceId: string, id: string) {
    const template = await this.prisma.invoiceTemplate.findFirst({ where: { id, workspaceId } });
    if (!template) return;
    await this.prisma.invoiceTemplate.update({ where: { id }, data: { usageCount: { increment: 1 } } });
  }

  // U3 approach: reject (404) if the template isn't in the workspace, then
  // in a transaction unset whichever template is currently the default and
  // set the new one — a workspace only ever has one default per document type.
  async setDefault(workspaceId: string, id: string) {
    const template = await this.prisma.invoiceTemplate.findFirst({ where: { id, workspaceId } });
    if (!template) throw new NotFoundException('Template not found');

    await this.prisma.$transaction([
      this.prisma.invoiceTemplate.updateMany({
        where: { workspaceId, isDefault: true },
        data:  { isDefault: false },
      }),
      this.prisma.invoiceTemplate.update({
        where: { id },
        data:  { isDefault: true },
      }),
    ]);

    return this.findOne(workspaceId, id);
  }

  // Belt-and-suspenders for KTD3's caller (InvoicesService.createFromContract()):
  // returns null rather than throwing when a workspace has no default yet
  // (pre-seed state), so the caller can fall back to its own `null` notes.
  async getDefault(workspaceId: string) {
    const template = await this.prisma.invoiceTemplate.findFirst({ where: { workspaceId, isDefault: true } });
    return template ? this.serialize(template) : null;
  }

  // KTD4: idempotent, safe to call on every login — mirrors
  // AutomationsService.seedDefaultRules()'s upsert shape, keyed by the
  // nullable (workspaceId, key) unique constraint so concurrent logins never
  // create two "system-default" rows for the same workspace.
  async seedDefault(workspaceId: string): Promise<void> {
    await this.prisma.invoiceTemplate.upsert({
      where:  { workspaceId_key: { workspaceId, key: 'system-default' } },
      update: {},
      create: {
        workspaceId,
        key:       'system-default',
        isSystem:  true,
        isDefault: true,
        name:      'Standard Invoice',
        ...DEFAULT_INVOICE_CONTENT,
      },
    });
  }
}

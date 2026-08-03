import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { createHash } from 'crypto';
import { PrismaService } from '../../../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import type { AdminTemplateQueryDto, AdminTemplateType, AdminTemplateUpdateDto } from './dto/admin-template.dto';

export interface TemplateRow {
  id: string;
  type: AdminTemplateType;
  workspaceId: string;
  workspaceName: string;
  name: string;
  key: string | null;
  description: string | null;
  category: string | null;
  isSystem: boolean;
  isDefault: boolean;
  isCustomized: boolean;
  usageCount: number;
  totalAmount: number | null;
  updatedAt: Date;
  createdAt: Date;
}

@Injectable()
export class AdminTemplateConfigurationService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async list(query: AdminTemplateQueryDto = {}) {
    const rows = await this.loadRows(query);
    const search = query.q?.trim().toLowerCase();
    const filtered = rows.filter((row) => !search || [row.name, row.key, row.description, row.category, row.workspaceName].some((value) => value?.toLowerCase().includes(search)));
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    return { items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize };
  }

  async detail(type: AdminTemplateType, id: string, includeContent: boolean) {
    const row = await this.getRecord(type, id);
    const metadata = this.serialize(row, type);
    if (!includeContent) return metadata;
    if (type === 'email') {
      const template = row as { subject: string; bodyHtml: string };
      return { ...metadata, subject: template.subject, bodyHtml: template.bodyHtml };
    }
    const template = row as { content: unknown };
    return { ...metadata, content: this.limitJson(template.content) };
  }

  async update(adminId: string, adminRole: 'SUPERADMIN' | 'SUPPORT', type: AdminTemplateType, id: string, dto: AdminTemplateUpdateDto) {
    const before = await this.getRecord(type, id);
    const data: Record<string, unknown> = {};
    if (type === 'email') {
      if (dto.subject !== undefined) data.subject = dto.subject;
      if (dto.bodyHtml !== undefined) data.bodyHtml = dto.bodyHtml;
      if (!Object.keys(data).length) throw new BadRequestException('Email template update requires subject or bodyHtml.');
    } else {
      for (const field of ['name', 'description', 'category'] as const) if (dto[field] !== undefined) data[field] = dto[field];
      if (dto.content !== undefined) data.content = dto.content as Prisma.InputJsonValue;
      if (dto.totalAmount !== undefined) data.totalAmount = new Decimal(dto.totalAmount);
      if (!Object.keys(data).length) throw new BadRequestException('Template update contains no supported fields.');
    }
    const updated = await this.updateRecord(type, id, data);
    await this.audit.log({
      adminId,
      adminRole,
      targetType: 'template',
      targetId: id,
      action: 'admin.configuration.template.update',
      before: this.auditMetadata(before),
      after: this.auditMetadata(updated),
      reason: dto.reason ?? null,
    });
    return this.detail(type, id, true);
  }

  async preview(type: AdminTemplateType, id: string) {
    const row = await this.getRecord(type, id);
    if (type === 'email') {
      const template = row as { subject: string; bodyHtml: string };
      const sample = { businessName: 'Sample Studio', clientName: 'Sample Client', invoiceNumber: 'INV-0001' };
      return {
        type,
        subject: this.replaceSamples(template.subject, sample),
        bodyHtml: this.replaceSamples(template.bodyHtml, sample),
      };
    }
    return { type, content: this.limitJson((row as { content: unknown }).content), sampleData: { businessName: 'Sample Studio', clientName: 'Sample Client' } };
  }

  async reset(adminId: string, adminRole: 'SUPERADMIN' | 'SUPPORT', type: AdminTemplateType, id: string, reason?: string) {
    if (type !== 'email') throw new BadRequestException('Only email templates support reset to a system default.');
    const before = await this.getRecord(type, id);
    await this.prisma.emailTemplate.delete({ where: { id } });
    await this.audit.log({ adminId, adminRole, targetType: 'template', targetId: id, action: 'admin.configuration.template.reset', before: this.auditMetadata(before), after: { reset: true }, reason: reason ?? null });
    return { reset: true, id };
  }

  async setDefault(adminId: string, adminRole: 'SUPERADMIN' | 'SUPPORT', type: AdminTemplateType, id: string, reason?: string) {
    if (type !== 'contract' && type !== 'invoice') throw new BadRequestException('Only contract and invoice templates support defaults.');
    const before = await this.getRecord(type, id);
    if (type === 'contract') {
      await this.prisma.$transaction([
        this.prisma.contractTemplate.updateMany({ where: { workspaceId: before.workspaceId, isDefault: true }, data: { isDefault: false } }),
        this.prisma.contractTemplate.update({ where: { id }, data: { isDefault: true } }),
      ]);
    } else {
      await this.prisma.$transaction([
        this.prisma.invoiceTemplate.updateMany({ where: { workspaceId: before.workspaceId, isDefault: true }, data: { isDefault: false } }),
        this.prisma.invoiceTemplate.update({ where: { id }, data: { isDefault: true } }),
      ]);
    }
    const after = await this.getRecord(type, id);
    await this.audit.log({ adminId, adminRole, targetType: 'template', targetId: id, action: 'admin.configuration.template.default', before: this.auditMetadata(before), after: this.auditMetadata(after), reason: reason ?? null });
    return this.serialize(after, type);
  }

  private async loadRows(query: AdminTemplateQueryDto): Promise<TemplateRow[]> {
    const workspaceFilter = query.workspaceId ? { workspaceId: query.workspaceId } : {};
    const [email, proposal, contract, invoice] = await Promise.all([
      !query.type || query.type === 'email' ? this.prisma.emailTemplate.findMany({ where: workspaceFilter, include: { workspace: { select: { name: true } } }, take: 5000 }) : Promise.resolve([]),
      !query.type || query.type === 'proposal' ? this.prisma.proposalTemplate.findMany({ where: workspaceFilter, include: { workspace: { select: { name: true } } }, take: 5000 }) : Promise.resolve([]),
      !query.type || query.type === 'contract' ? this.prisma.contractTemplate.findMany({ where: workspaceFilter, include: { workspace: { select: { name: true } } }, take: 5000 }) : Promise.resolve([]),
      !query.type || query.type === 'invoice' ? this.prisma.invoiceTemplate.findMany({ where: workspaceFilter, include: { workspace: { select: { name: true } } }, take: 5000 }) : Promise.resolve([]),
    ]);
    return [
      ...email.map((item) => ({ id: item.id, type: 'email' as const, workspaceId: item.workspaceId, workspaceName: item.workspace.name, name: item.templateKey, key: item.templateKey, description: null, category: 'email', isSystem: false, isDefault: false, isCustomized: true, usageCount: 0, totalAmount: null, updatedAt: item.updatedAt, createdAt: item.createdAt })),
      ...proposal.map((item) => this.documentRow('proposal', item)),
      ...contract.map((item) => this.documentRow('contract', item)),
      ...invoice.map((item) => this.documentRow('invoice', item)),
    ].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  private documentRow(type: 'proposal' | 'contract' | 'invoice', item: any): TemplateRow {
    return { id: item.id, type, workspaceId: item.workspaceId, workspaceName: item.workspace.name, name: item.name, key: item.key ?? null, description: item.description ?? null, category: item.category ?? null, isSystem: Boolean(item.isSystem), isDefault: Boolean(item.isDefault), isCustomized: true, usageCount: item.usageCount ?? 0, totalAmount: item.totalAmount === null || item.totalAmount === undefined ? null : Number(item.totalAmount), updatedAt: item.updatedAt, createdAt: item.createdAt };
  }

  private async getRecord(type: AdminTemplateType, id: string): Promise<any> {
    const record = type === 'email'
      ? await this.prisma.emailTemplate.findUnique({ where: { id }, include: { workspace: { select: { name: true } } } })
      : type === 'proposal'
        ? await this.prisma.proposalTemplate.findUnique({ where: { id }, include: { workspace: { select: { name: true } } } })
        : type === 'contract'
          ? await this.prisma.contractTemplate.findUnique({ where: { id }, include: { workspace: { select: { name: true } } } })
          : await this.prisma.invoiceTemplate.findUnique({ where: { id }, include: { workspace: { select: { name: true } } } });
    if (!record) throw new NotFoundException('Template not found.');
    return record;
  }

  private async updateRecord(type: AdminTemplateType, id: string, data: Record<string, unknown>) {
    if (type === 'email') return this.prisma.emailTemplate.update({ where: { id }, data: data as any });
    if (type === 'proposal') return this.prisma.proposalTemplate.update({ where: { id }, data: data as any });
    if (type === 'contract') return this.prisma.contractTemplate.update({ where: { id }, data: data as any });
    return this.prisma.invoiceTemplate.update({ where: { id }, data: data as any });
  }

  private serialize(record: any, type?: AdminTemplateType) {
    return {
      id: record.id,
      type: type ?? (record.bodyHtml !== undefined ? 'email' : 'template'),
      workspaceId: record.workspaceId,
      workspaceName: record.workspace?.name ?? null,
      name: record.name ?? record.templateKey,
      key: record.key ?? record.templateKey ?? null,
      description: record.description ?? null,
      category: record.category ?? null,
      isSystem: Boolean(record.isSystem),
      isDefault: Boolean(record.isDefault),
      isCustomized: true,
      usageCount: record.usageCount ?? 0,
      totalAmount: record.totalAmount === null || record.totalAmount === undefined ? null : Number(record.totalAmount),
      updatedAt: record.updatedAt,
      createdAt: record.createdAt,
    };
  }

  private auditMetadata(record: any) {
    return {
      type: record.bodyHtml !== undefined ? 'email' : 'document',
      workspaceId: record.workspaceId,
      name: record.name ?? record.templateKey,
      key: record.key ?? record.templateKey,
      isSystem: record.isSystem ?? false,
      isDefault: record.isDefault ?? false,
      contentHash: createHash('sha256').update(JSON.stringify(record.bodyHtml ?? record.content ?? '')).digest('hex'),
    };
  }

  private replaceSamples(value: string, samples: Record<string, string>) {
    return value.replace(/{{\s*([^}\s]+)\s*}}/g, (_, key: string) => samples[key] ?? `[${key}]`);
  }

  private limitJson(value: unknown) {
    const serialized = JSON.stringify(value ?? null);
    return serialized.length > 200000 ? { redacted: true, reason: 'Template content exceeds the admin response limit.', byteLength: serialized.length } : value;
  }
}

import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import Decimal from 'decimal.js';
import type { ContractTemplate } from '@prisma/client';
import { DEFAULT_CONTRACT_CONTENT } from './default-content';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { FromContractDto } from './dto/from-contract.dto';

// U2/KTD2: unlike proposal-templates.service.ts, there is no SYSTEM_TEMPLATES
// virtual-constant merge here — the seeded "system-default" row (seedDefault())
// is a real ContractTemplate row per workspace, so list()/findOne() read only
// real rows.
@Injectable()
export class ContractTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  private serialize(template: ContractTemplate) {
    return { ...template, totalAmount: Number(template.totalAmount) };
  }

  async list(workspaceId: string) {
    const templates = await this.prisma.contractTemplate.findMany({
      where:   { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return templates.map((t) => this.serialize(t));
  }

  async findOne(workspaceId: string, id: string) {
    const template = await this.prisma.contractTemplate.findFirst({ where: { id, workspaceId } });
    if (!template) throw new NotFoundException('Template not found');
    return this.serialize(template);
  }

  async create(workspaceId: string, dto: CreateTemplateDto) {
    const template = await this.prisma.contractTemplate.create({
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
    const template = await this.prisma.contractTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');
    if (template.workspaceId !== workspaceId) throw new ForbiddenException();

    const updated = await this.prisma.contractTemplate.update({
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
    const template = await this.prisma.contractTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');
    if (template.workspaceId !== workspaceId) throw new ForbiddenException();

    if (template.isSystem) {
      throw new BadRequestException('System templates cannot be deleted');
    }
    if (template.isDefault) {
      throw new BadRequestException('Cannot delete the current default template — set a different template as default first');
    }

    await this.prisma.contractTemplate.delete({ where: { id } });
    return { success: true };
  }

  async fromContract(workspaceId: string, contractId: string, dto: FromContractDto) {
    const contract = await this.prisma.contract.findFirst({ where: { id: contractId, workspaceId } });
    if (!contract) throw new NotFoundException('Contract not found');

    const content = contract.content as Record<string, unknown>;
    const totalAmount = Number(content?.totalAmount ?? 0);

    const template = await this.prisma.contractTemplate.create({
      data: {
        workspaceId,
        name:        dto.name,
        description: dto.description,
        category:    dto.category,
        content:     contract.content as object,
        totalAmount: new Decimal(totalAmount),
      },
    });
    return this.serialize(template);
  }

  async incrementUsage(workspaceId: string, id: string) {
    const template = await this.prisma.contractTemplate.findFirst({ where: { id, workspaceId } });
    if (!template) return;
    await this.prisma.contractTemplate.update({ where: { id }, data: { usageCount: { increment: 1 } } });
  }

  // U2 approach: reject (404) if the template isn't in the workspace, then
  // in a transaction unset whichever template is currently the default and
  // set the new one — a workspace only ever has one default per document type.
  async setDefault(workspaceId: string, id: string) {
    const template = await this.prisma.contractTemplate.findFirst({ where: { id, workspaceId } });
    if (!template) throw new NotFoundException('Template not found');

    await this.prisma.$transaction([
      this.prisma.contractTemplate.updateMany({
        where: { workspaceId, isDefault: true },
        data:  { isDefault: false },
      }),
      this.prisma.contractTemplate.update({
        where: { id },
        data:  { isDefault: true },
      }),
    ]);

    return this.findOne(workspaceId, id);
  }

  // Belt-and-suspenders for KTD3's caller (ContractsService.createFromProposal()):
  // returns null rather than throwing when a workspace has no default yet
  // (pre-seed state), so the caller can fall back to its own hardcoded default.
  async getDefault(workspaceId: string) {
    const template = await this.prisma.contractTemplate.findFirst({ where: { workspaceId, isDefault: true } });
    return template ? this.serialize(template) : null;
  }

  // KTD4: idempotent, safe to call on every login — mirrors
  // AutomationsService.seedDefaultRules()'s upsert shape, keyed by the
  // nullable (workspaceId, key) unique constraint so concurrent logins never
  // create two "system-default" rows for the same workspace.
  async seedDefault(workspaceId: string): Promise<void> {
    await this.prisma.contractTemplate.upsert({
      where:  { workspaceId_key: { workspaceId, key: 'system-default' } },
      update: {},
      create: {
        workspaceId,
        key:         'system-default',
        isSystem:    true,
        isDefault:   true,
        name:        'Standard Contract',
        description: DEFAULT_CONTRACT_CONTENT.description,
        category:    DEFAULT_CONTRACT_CONTENT.category,
        content:     DEFAULT_CONTRACT_CONTENT.content as object,
      },
    });
  }
}

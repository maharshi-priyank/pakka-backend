import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import Decimal from 'decimal.js';
import { SYSTEM_TEMPLATES } from './system-templates';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { FromProposalDto } from './dto/from-proposal.dto';

@Injectable()
export class ProposalTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string) {
    const userTemplates = await this.prisma.proposalTemplate.findMany({
      where:   { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return [
      ...SYSTEM_TEMPLATES,
      ...userTemplates.map(t => ({ ...t, isSystem: false, totalAmount: Number(t.totalAmount) })),
    ];
  }

  async findOne(workspaceId: string, id: string) {
    const template = await this.prisma.proposalTemplate.findFirst({ where: { id, workspaceId } });
    if (!template) throw new NotFoundException('Template not found');
    return { ...template, isSystem: false, totalAmount: Number(template.totalAmount) };
  }

  async create(workspaceId: string, dto: CreateTemplateDto) {
    const template = await this.prisma.proposalTemplate.create({
      data: {
        workspaceId,
        name:        dto.name,
        description: dto.description,
        category:    dto.category,
        content:     dto.content as object,
        totalAmount: dto.totalAmount ? new Decimal(dto.totalAmount) : new Decimal(0),
      },
    });
    return { ...template, isSystem: false, totalAmount: Number(template.totalAmount) };
  }

  async update(workspaceId: string, id: string, dto: UpdateTemplateDto) {
    const template = await this.prisma.proposalTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');
    if (template.workspaceId !== workspaceId) throw new ForbiddenException();

    const updated = await this.prisma.proposalTemplate.update({
      where: { id },
      data: {
        ...(dto.name        !== undefined ? { name:        dto.name }                  : {}),
        ...(dto.description !== undefined ? { description: dto.description }           : {}),
        ...(dto.category    !== undefined ? { category:    dto.category }              : {}),
        ...(dto.content     !== undefined ? { content:     dto.content as object }     : {}),
        ...(dto.totalAmount !== undefined ? { totalAmount: new Decimal(dto.totalAmount) } : {}),
      },
    });
    return { ...updated, isSystem: false, totalAmount: Number(updated.totalAmount) };
  }

  async remove(workspaceId: string, id: string) {
    const template = await this.prisma.proposalTemplate.findUnique({ where: { id } });
    if (!template) throw new NotFoundException('Template not found');
    if (template.workspaceId !== workspaceId) throw new ForbiddenException();
    await this.prisma.proposalTemplate.delete({ where: { id } });
    return { success: true };
  }

  async fromProposal(workspaceId: string, proposalId: string, dto: FromProposalDto) {
    const proposal = await this.prisma.proposal.findFirst({ where: { id: proposalId, workspaceId } });
    if (!proposal) throw new NotFoundException('Proposal not found');

    const template = await this.prisma.proposalTemplate.create({
      data: {
        workspaceId,
        name:        dto.name,
        description: dto.description,
        category:    dto.category,
        content:     proposal.content as object,
        totalAmount: proposal.totalAmount,
      },
    });
    return { ...template, isSystem: false, totalAmount: Number(template.totalAmount) };
  }

  async incrementUsage(workspaceId: string, id: string) {
    if (id.startsWith('system:')) return;
    const template = await this.prisma.proposalTemplate.findFirst({ where: { id, workspaceId } });
    if (!template) return;
    await this.prisma.proposalTemplate.update({ where: { id }, data: { usageCount: { increment: 1 } } });
  }
}

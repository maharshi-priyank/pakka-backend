import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { QueryLeadsDto } from './dto/query-leads.dto';
import { LeadStage } from '@prisma/client';
import Decimal from 'decimal.js';

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma:       PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(userId: string, dto: CreateLeadDto) {
    const lead = await this.prisma.lead.create({
      data: {
        ...dto,
        budget: dto.budget !== undefined ? new Decimal(dto.budget) : undefined,
        followUpAt: dto.followUpAt ? new Date(dto.followUpAt) : undefined,
        userId,
      },
      include: { client: true },
    });
    this.eventEmitter.emit('lead.created', { entityId: lead.id, userId });
    return lead;
  }

  async findAll(userId: string, query: QueryLeadsDto) {
    const { page = 1, limit = 20, search, stage } = query;
    const skip = (page - 1) * limit;

    const where = {
      userId,
      isDeleted: false,
      ...(stage && { stage }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { company: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [leads, total, pipelineAgg] = await Promise.all([
      this.prisma.lead.findMany({
        where,
        skip,
        take: limit,
        orderBy: { lastActivityAt: 'desc' },
        include: { client: true, proposals: { select: { id: true, status: true } } },
      }),
      this.prisma.lead.count({ where }),
      this.prisma.lead.aggregate({
        where: { userId, isDeleted: false, stage: { notIn: [LeadStage.WON, LeadStage.LOST] }, budget: { not: null } },
        _sum: { budget: true },
      }),
    ]);

    return {
      items:         leads,
      total,
      page,
      limit,
      pipelineValue: (pipelineAgg._sum.budget ?? 0).toString(),
    };
  }

  async findOne(userId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, userId, isDeleted: false },
      include: {
        client: true,
        proposals: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  async update(userId: string, id: string, dto: UpdateLeadDto) {
    await this.findOne(userId, id);

    return this.prisma.lead.update({
      where: { id },
      data: {
        ...dto,
        budget: dto.budget !== undefined ? new Decimal(dto.budget) : undefined,
        followUpAt: dto.followUpAt ? new Date(dto.followUpAt) : undefined,
        lastActivityAt: new Date(),
      },
      include: { client: true },
    });
  }

  async updateStage(userId: string, id: string, stage: LeadStage) {
    await this.findOne(userId, id);

    return this.prisma.lead.update({
      where: { id },
      data: { stage, lastActivityAt: new Date() },
    });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.lead.update({ where: { id }, data: { isDeleted: true } });
  }

  async convertToClient(userId: string, leadId: string) {
    const lead = await this.findOne(userId, leadId);

    if (lead.clientId) {
      throw new ConflictException('This lead is already linked to a client');
    }

    const client = await this.prisma.client.create({
      data: {
        userId,
        name:    lead.name,
        email:   lead.email   ?? undefined,
        phone:   lead.phone   ?? undefined,
        company: lead.company ?? undefined,
      },
    });

    await this.prisma.lead.update({
      where: { id: leadId },
      data:  { clientId: client.id, lastActivityAt: new Date() },
    });

    return client;
  }

  async getPipelineValue(userId: string) {
    const result = await this.prisma.lead.aggregate({
      where: {
        userId,
        isDeleted: false,
        stage: { notIn: [LeadStage.WON, LeadStage.LOST] },
        budget: { not: null },
      },
      _sum: { budget: true },
      _count: true,
    });

    return {
      total: result._sum.budget ?? 0,
      count: result._count,
    };
  }
}

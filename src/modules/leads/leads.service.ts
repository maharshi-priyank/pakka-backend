import { Injectable, NotFoundException, ConflictException, HttpException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { nanoid } from 'nanoid';
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
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { plan: true, planExpiresAt: true } });
    const effectivePlan = (user?.planExpiresAt && user.planExpiresAt < new Date()) ? 'FREE' : user?.plan;
    if (effectivePlan === 'FREE') {
      const count = await this.prisma.lead.count({ where: { userId, isDeleted: false, stage: { notIn: ['WON', 'LOST'] } } });
      if (count >= 3) throw new HttpException({ message: 'Free plan: 3 active leads limit reached.', code: 'PLAN_LIMIT' }, 402);
    }

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

    const [client] = await this.prisma.$transaction(async (tx) => {
      const newClient = await tx.client.create({
        data: {
          userId,
          name:        lead.name,
          email:       lead.email   ?? undefined,
          phone:       lead.phone   ?? undefined,
          company:     lead.company ?? undefined,
          portalToken: nanoid(21),
        },
      });

      await tx.lead.update({
        where: { id: leadId },
        data:  { clientId: newClient.id, stage: LeadStage.WON, lastActivityAt: new Date() },
      });

      // Backfill clientId on all proposals made for this lead
      const proposals = await tx.proposal.findMany({
        where: { leadId },
        select: { id: true },
      });
      const proposalIds = proposals.map(p => p.id);

      if (proposalIds.length > 0) {
        await tx.proposal.updateMany({
          where: { id: { in: proposalIds } },
          data:  { clientId: newClient.id },
        });

        // Backfill clientId on contracts linked to those proposals
        const contracts = await tx.contract.findMany({
          where: { proposalId: { in: proposalIds } },
          select: { id: true },
        });
        const contractIds = contracts.map(c => c.id);

        if (contractIds.length > 0) {
          await tx.contract.updateMany({
            where: { id: { in: contractIds } },
            data:  { clientId: newClient.id },
          });

          // Backfill clientId on invoices linked to those contracts
          await tx.invoice.updateMany({
            where: { contractId: { in: contractIds } },
            data:  { clientId: newClient.id },
          });
        }
      }

      return [newClient];
    });

    this.eventEmitter.emit('lead.converted', { entityId: leadId, userId, clientId: client.id })
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

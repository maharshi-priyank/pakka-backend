import { Injectable, NotFoundException, HttpException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { nanoid } from 'nanoid';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { QueryClientsDto } from './dto/query-clients.dto';
import { effectivePlan } from '../users/effective-plan';

const CLIENT_LIMITS = { FREE: 5, SOLO: 25, STUDIO: Infinity } as const;

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma:        PrismaService,
    private readonly config:        ConfigService,
    private readonly eventEmitter:  EventEmitter2,
  ) {}

  async create(workspaceId: string, dto: CreateClientDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: workspaceId },
      select: { plan: true, planExpiresAt: true, subscriptionStatus: true },
    });
    const plan = effectivePlan(user!);
    const limit = CLIENT_LIMITS[plan];
    if (isFinite(limit)) {
      const count = await this.prisma.client.count({ where: { workspaceId } });
      if (count >= limit) {
        throw new HttpException(
          { message: `${plan === 'FREE' ? 'Free' : 'Solo'} plan: ${limit} client limit reached. Upgrade to add more.`, code: 'PLAN_LIMIT' },
          402,
        );
      }
    }
    const client = await this.prisma.client.create({
      data: { ...dto, workspaceId, portalToken: nanoid(21) },
    });
    this.eventEmitter.emit('client.created', { entityId: client.id, workspaceId });
    return client;
  }

  async regeneratePortalToken(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id);
    const portalToken = nanoid(21);
    const client = await this.prisma.client.update({
      where: { id },
      data: { portalToken },
    });
    const appUrl = this.config.get<string>('appUrl');
    return { portalToken: client.portalToken, portalUrl: `${appUrl}/portal/${client.portalToken}` };
  }

  async findAll(workspaceId: string, query: QueryClientsDto) {
    const { page = 1, limit = 20, search } = query;
    const skip = (page - 1) * limit;

    const where = {
      workspaceId,
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(search && {
        OR: [
          { name:    { contains: search, mode: 'insensitive' as const } },
          { email:   { contains: search, mode: 'insensitive' as const } },
          { company: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [clients, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { proposals: true, contracts: true, invoices: true },
          },
        },
      }),
      this.prisma.client.count({ where }),
    ]);

    return {
      clients,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(workspaceId: string, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, workspaceId },
      include: {
        proposals: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, title: true, status: true, totalAmount: true, createdAt: true, acceptedAt: true },
        },
        contracts: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, title: true, status: true, createdAt: true, sentAt: true, signedAt: true },
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, invoiceNumber: true, status: true, total: true, dueDate: true, createdAt: true, paidAt: true },
        },
        leads: {
          orderBy: { createdAt: 'desc' },
          where:   { isDeleted: false },
          select:  { id: true, name: true, stage: true, budget: true, source: true, createdAt: true },
        },
        meetings: {
          orderBy: { scheduledAt: 'desc' },
          where:   { status: { not: 'CANCELLED' } },
          select:  { id: true, title: true, scheduledAt: true, status: true, meetLink: true },
        },
        projects: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true, name: true, status: true, budget: true,
            startDate: true, endDate: true, createdAt: true, shareRateWithClient: true,
            timeEntries: {
              orderBy: { date: 'desc' },
              take: 50,
              select: { id: true, description: true, date: true, durationMins: true, hourlyRate: true, isBilled: true },
            },
            expenses: {
              where:   { isBillable: true },
              orderBy: { date: 'desc' },
              take: 50,
              select: { id: true, description: true, category: true, amount: true, date: true, isBilled: true },
            },
          },
        },
        _count: {
          select: { proposals: true, contracts: true, invoices: true, projects: true },
        },
      },
    });

    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async update(workspaceId: string, id: string, dto: UpdateClientDto) {
    await this.findOne(workspaceId, id);
    return this.prisma.client.update({
      where: { id },
      data: dto,
    });
  }

  async listNotes(workspaceId: string, clientId: string) {
    await this.findOne(workspaceId, clientId);
    return this.prisma.clientNote.findMany({
      where: { clientId, workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createNote(workspaceId: string, clientId: string, content: string) {
    await this.findOne(workspaceId, clientId);
    return this.prisma.clientNote.create({
      data: { workspaceId, clientId, content },
    });
  }

  async deleteNote(workspaceId: string, clientId: string, noteId: string) {
    await this.findOne(workspaceId, clientId);
    await this.prisma.clientNote.deleteMany({ where: { id: noteId, workspaceId, clientId } });
  }

  async archive(workspaceId: string, id: string) {
    const client = await this.findOne(workspaceId, id);
    if (client.archivedAt) throw new BadRequestException('Client is already archived');
    return this.prisma.client.update({ where: { id }, data: { archivedAt: new Date() } });
  }

  async unarchive(workspaceId: string, id: string) {
    const client = await this.findOne(workspaceId, id);
    if (!client.archivedAt) throw new BadRequestException('Client is not archived');
    return this.prisma.client.update({ where: { id }, data: { archivedAt: null } });
  }

  async remove(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id);
    const [proposals, contracts, invoices, projects, meetings] = await Promise.all([
      this.prisma.proposal.count({ where: { clientId: id } }),
      this.prisma.contract.count({ where: { clientId: id } }),
      this.prisma.invoice.count({ where: { clientId: id } }),
      this.prisma.project.count({ where: { clientId: id } }),
      this.prisma.meeting.count({ where: { clientId: id } }),
    ]);
    const total = proposals + contracts + invoices + projects + meetings;
    if (total > 0) {
      const parts = [
        proposals && `${proposals} proposal${proposals > 1 ? 's' : ''}`,
        contracts && `${contracts} contract${contracts > 1 ? 's' : ''}`,
        invoices  && `${invoices} invoice${invoices > 1 ? 's' : ''}`,
        projects  && `${projects} project${projects > 1 ? 's' : ''}`,
        meetings  && `${meetings} meeting${meetings > 1 ? 's' : ''}`,
      ].filter(Boolean).join(', ');
      throw new BadRequestException(`Cannot delete: this client has ${parts}. Archive instead.`);
    }
    await this.prisma.client.delete({ where: { id } });
  }
}

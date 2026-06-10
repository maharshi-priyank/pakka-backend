import { Injectable, NotFoundException, HttpException } from '@nestjs/common';
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

  async create(userId: string, dto: CreateClientDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, planExpiresAt: true, subscriptionStatus: true },
    });
    const plan = effectivePlan(user!);
    const limit = CLIENT_LIMITS[plan];
    if (isFinite(limit)) {
      const count = await this.prisma.client.count({ where: { userId } });
      if (count >= limit) {
        throw new HttpException(
          { message: `${plan === 'FREE' ? 'Free' : 'Solo'} plan: ${limit} client limit reached. Upgrade to add more.`, code: 'PLAN_LIMIT' },
          402,
        );
      }
    }
    const client = await this.prisma.client.create({
      data: { ...dto, userId, portalToken: nanoid(21) },
    });
    this.eventEmitter.emit('client.created', { entityId: client.id, userId });
    return client;
  }

  async regeneratePortalToken(userId: string, id: string) {
    await this.findOne(userId, id);
    const portalToken = nanoid(21);
    const client = await this.prisma.client.update({
      where: { id },
      data: { portalToken },
    });
    const appUrl = this.config.get<string>('appUrl');
    return { portalToken: client.portalToken, portalUrl: `${appUrl}/portal/${client.portalToken}` };
  }

  async findAll(userId: string, query: QueryClientsDto) {
    const { page = 1, limit = 20, search } = query;
    const skip = (page - 1) * limit;

    const where = {
      userId,
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

  async findOne(userId: string, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, userId },
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
              select: { id: true, description: true, date: true, durationMins: true, hourlyRate: true, isBilled: true },
            },
            expenses: {
              where:   { isBillable: true },
              orderBy: { date: 'desc' },
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

  async update(userId: string, id: string, dto: UpdateClientDto) {
    await this.findOne(userId, id);
    return this.prisma.client.update({
      where: { id },
      data: dto,
    });
  }

  async listNotes(userId: string, clientId: string) {
    await this.findOne(userId, clientId);
    return this.prisma.clientNote.findMany({
      where: { clientId, userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createNote(userId: string, clientId: string, content: string) {
    await this.findOne(userId, clientId);
    return this.prisma.clientNote.create({
      data: { userId, clientId, content },
    });
  }

  async deleteNote(userId: string, clientId: string, noteId: string) {
    await this.findOne(userId, clientId);
    await this.prisma.clientNote.deleteMany({ where: { id: noteId, userId, clientId } });
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.$transaction([
      this.prisma.proposal.updateMany({ where: { clientId: id }, data: { clientId: null } }),
      this.prisma.contract.updateMany({ where: { clientId: id }, data: { clientId: null } }),
      this.prisma.invoice.updateMany({ where: { clientId: id }, data: { clientId: null } }),
      this.prisma.meeting.updateMany({ where: { clientId: id }, data: { clientId: null } }),
      this.prisma.lead.updateMany({ where: { clientId: id }, data: { clientId: null } }),
      this.prisma.client.delete({ where: { id } }),
    ]);
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { nanoid } from 'nanoid';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { QueryClientsDto } from './dto/query-clients.dto';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async create(userId: string, dto: CreateClientDto) {
    return this.prisma.client.create({
      data: { ...dto, userId, portalToken: nanoid(21) },
    });
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
          select: { id: true, title: true, status: true, totalAmount: true, createdAt: true },
        },
        contracts: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, title: true, status: true, createdAt: true },
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, invoiceNumber: true, status: true, total: true, dueDate: true, createdAt: true },
        },
        leads: {
          orderBy: { createdAt: 'desc' },
          where:   { isDeleted: false },
          select:  { id: true, name: true, stage: true, budget: true, source: true, createdAt: true },
        },
        _count: {
          select: { proposals: true, contracts: true, invoices: true },
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

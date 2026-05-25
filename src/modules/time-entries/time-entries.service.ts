import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';
import { GstType } from '@prisma/client';
import { CreateTimeEntryDto } from './dto/create-time-entry.dto';
import { UpdateTimeEntryDto } from './dto/update-time-entry.dto';
import { QueryTimeEntriesDto } from './dto/query-time-entries.dto';
import { BillEntriesDto } from './dto/bill-entries.dto';

@Injectable()
export class TimeEntriesService {
  constructor(
    private readonly prisma:   PrismaService,
    private readonly invoices: InvoicesService,
  ) {}

  private readonly projectInclude = {
    client:  { select: { id: true, name: true } },
    project: { select: { id: true, name: true } },
  } as const;

  async create(userId: string, dto: CreateTimeEntryDto) {
    return this.prisma.timeEntry.create({
      data: {
        userId,
        clientId:     dto.clientId,
        projectId:    dto.projectId,
        description:  dto.description,
        date:         new Date(dto.date),
        durationMins: dto.durationMins,
        hourlyRate:   dto.hourlyRate != null ? dto.hourlyRate : null,
      },
      include: this.projectInclude,
    });
  }

  async findAll(userId: string, query: QueryTimeEntriesDto) {
    const where: {
      userId:     string;
      clientId?:  string;
      projectId?: string;
      isBilled?:  boolean;
      date?:      { gte?: Date; lte?: Date };
    } = { userId };

    if (query.clientId)          where.clientId  = query.clientId;
    if (query.projectId)         where.projectId = query.projectId;
    if (query.isBilled != null)  where.isBilled  = query.isBilled;
    if (query.from || query.to) {
      where.date = {};
      if (query.from) where.date.gte = new Date(query.from);
      if (query.to)   where.date.lte = new Date(query.to);
    }

    return this.prisma.timeEntry.findMany({
      where,
      orderBy: { date: 'desc' },
      include: this.projectInclude,
    });
  }

  async update(userId: string, id: string, dto: UpdateTimeEntryDto) {
    await this.findOwned(userId, id);
    return this.prisma.timeEntry.update({
      where: { id },
      data: {
        ...(dto.clientId     != null && { clientId:  dto.clientId }),
        ...(dto.projectId    != null && { projectId: dto.projectId }),
        ...(dto.description  != null && { description: dto.description }),
        ...(dto.date         != null && { date: new Date(dto.date) }),
        ...(dto.durationMins != null && { durationMins: dto.durationMins }),
        ...(dto.hourlyRate   != null && { hourlyRate: dto.hourlyRate }),
        ...(dto.isBilled     != null && { isBilled: dto.isBilled }),
        ...(dto.invoiceId    != null && { invoiceId: dto.invoiceId }),
      },
      include: this.projectInclude,
    });
  }

  async remove(userId: string, id: string) {
    await this.findOwned(userId, id);
    await this.prisma.timeEntry.delete({ where: { id } });
  }

  async billEntries(userId: string, dto: BillEntriesDto) {
    const entries = await this.prisma.timeEntry.findMany({
      where: { id: { in: dto.entryIds }, userId, isBilled: false },
      include: { client: { select: { id: true, name: true } } },
    });

    if (entries.length === 0) throw new BadRequestException('No unbilled entries found');
    if (entries.length !== dto.entryIds.length) {
      throw new BadRequestException('Some entries are already billed or do not belong to you');
    }

    // All entries must share the same client
    const clientIds = [...new Set(entries.map(e => e.clientId))];
    if (clientIds.length > 1) throw new BadRequestException('All entries must be for the same client');

    const clientId = clientIds[0] ?? undefined;
    const lineItems = entries.map(e => {
      const hours = Number((e.durationMins / 60).toFixed(2));
      const rate  = e.hourlyRate != null ? Number(e.hourlyRate) * hours : 0;
      return {
        description: `${e.description} (${hours} hrs)`,
        qty:         1,
        rate,
        gstRate:     18,
      };
    });

    const invoice = await this.invoices.create(userId, {
      clientId,
      lineItems,
      gstType: GstType.IGST,
    } as any);

    await this.prisma.timeEntry.updateMany({
      where: { id: { in: dto.entryIds } },
      data:  { isBilled: true, invoiceId: invoice.id },
    });

    return invoice;
  }

  private async findOwned(userId: string, id: string) {
    const entry = await this.prisma.timeEntry.findFirst({ where: { id, userId } });
    if (!entry) throw new NotFoundException('Time entry not found');
    return entry;
  }
}

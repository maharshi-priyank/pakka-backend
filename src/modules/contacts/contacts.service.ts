import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { nanoid } from 'nanoid';
import Decimal from 'decimal.js';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { QueryContactsDto } from './dto/query-contacts.dto';
import { QueryContactHistoryDto } from './dto/query-contact-history.dto';
import { ContactStage } from '@prisma/client';
import { EntitlementsService } from '../entitlements/entitlements.service';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PhoneNumberUtil, PhoneNumberFormat } = require('google-libphonenumber') as typeof import('google-libphonenumber');
const phoneUtil = PhoneNumberUtil.getInstance();

const ACTIVE_STAGES: ContactStage[] = ['ENQUIRY', 'PROPOSAL_SENT', 'NEGOTIATING']

function normalizePhone(raw: string | null | undefined): string | null | undefined {
  if (!raw || raw.trim() === '') return raw;
  try {
    const parsed = phoneUtil.parseAndKeepRawInput(raw, 'IN');
    return phoneUtil.format(parsed, PhoneNumberFormat.E164);
  } catch {
    throw new BadRequestException('Invalid phone number format. Please use international format e.g. +91 98765 43210');
  }
}

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma:       PrismaService,
    private readonly config:       ConfigService,
    private readonly eventEmitter: EventEmitter2,
    private readonly entitlements: EntitlementsService,
  ) {}

  async create(workspaceId: string, dto: CreateContactDto) {
    const stage = dto.stage ?? 'ENQUIRY'
    if (ACTIVE_STAGES.includes(stage)) await this.entitlements.assertWithinLimit(workspaceId, 'activeLeads')
    if (stage === 'CLIENT' || stage === 'PAST_CLIENT') await this.entitlements.assertWithinLimit(workspaceId, 'clients')
    await this.entitlements.assertWithinLimit(workspaceId, 'projects')

    const contact = await this.prisma.$transaction(async (tx) => {
      const c = await tx.contact.create({
        data: {
          ...dto,
          phone:       normalizePhone(dto.phone),
          dealValue:  dto.dealValue  !== undefined ? new Decimal(dto.dealValue) : undefined,
          followUpAt: dto.followUpAt ? new Date(dto.followUpAt)                 : undefined,
          workspaceId,
          portalToken: nanoid(21),
        },
      })

      // Auto-create messaging Thread so the workspace can message the contact
      await tx.thread.create({
        data: { workspaceId, contactId: c.id },
      })

      // Auto-create default SCOPING Project so documents always have a home (R14)
      await tx.project.create({
        data: {
          workspaceId,
          contactId:    c.id,
          name:         dto.company?.trim() || dto.name,
          projectStage: 'SCOPING',
        },
      })

      return c
    })

    this.eventEmitter.emit('contact.created', { entityId: contact.id, workspaceId })
    return contact
  }

  async findAll(workspaceId: string, query: QueryContactsDto) {
    const { page = 1, limit = 20, search, stage, includeArchived } = query
    const skip = (page - 1) * limit

    const where = {
      workspaceId,
      ...(includeArchived ? {} : { archivedAt: null }),
      ...(stage && { stage }),
      ...(search && {
        OR: [
          { name:    { contains: search, mode: 'insensitive' as const } },
          { company: { contains: search, mode: 'insensitive' as const } },
          { email:   { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    }

    const [contacts, total, pipelineAgg] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        skip,
        take:     limit,
        orderBy:  { lastActivityAt: 'desc' },
        include:  {
          _count: {
            select: { proposals: true, contracts: true, invoices: true, projects: true },
          },
        },
      }),
      this.prisma.contact.count({ where }),
      this.prisma.contact.aggregate({
        where:  { workspaceId, archivedAt: null, stage: { in: ACTIVE_STAGES }, dealValue: { not: null } },
        _sum:   { dealValue: true },
      }),
    ])

    return {
      items:         contacts,
      total,
      page,
      limit,
      pipelineValue: (pipelineAgg._sum.dealValue ?? 0).toString(),
    }
  }

  async findOne(workspaceId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, workspaceId },
      include: {
        proposals: {
          orderBy: { createdAt: 'desc' },
          select:  { id: true, title: true, status: true, totalAmount: true, createdAt: true, acceptedAt: true },
        },
        contracts: {
          orderBy: { createdAt: 'desc' },
          select:  { id: true, title: true, status: true, createdAt: true, sentAt: true, signedAt: true },
        },
        invoices: {
          orderBy: { createdAt: 'desc' },
          select:  { id: true, invoiceNumber: true, status: true, total: true, amountPaid: true, dueDate: true, createdAt: true, paidAt: true },
        },
        projects: {
          orderBy: { updatedAt: 'desc' },
          select:  { id: true, name: true, status: true, projectStage: true, budget: true, startDate: true, endDate: true, createdAt: true, updatedAt: true },
        },
        meetings: {
          orderBy: { scheduledAt: 'desc' },
          where:   { status: { not: 'CANCELLED' } },
          select:  { id: true, title: true, scheduledAt: true, status: true, meetLink: true },
        },
        notesList: {
          orderBy: { createdAt: 'desc' },
        },
        threads: {
          select: { id: true, subject: true, updatedAt: true },
        },
        _count: {
          select: { proposals: true, contracts: true, invoices: true, projects: true },
        },
      },
    })

    if (!contact) throw new NotFoundException('Contact not found')
    return contact
  }

  async getCommunicationHistory(workspaceId: string, id: string, query: QueryContactHistoryDto) {
    const contact = await this.prisma.contact.findFirst({ where: { id, workspaceId } })
    if (!contact) throw new NotFoundException('Contact not found')

    const page  = query.page  ?? 1
    const limit = query.limit ?? 20

    const [emails, thread, meetings] = await Promise.all([
      this.prisma.communicationLog.findMany({
        where: { workspaceId, contactId: id, entityType: { not: 'message' } },
      }),
      // Read-only equivalent of messages.service.ts's getThreadByContactId() —
      // that method creates a Thread as a side effect if none exists yet,
      // which viewing history should never trigger.
      this.prisma.thread.findFirst({ where: { workspaceId, contactId: id } }),
      this.prisma.meeting.findMany({
        where: { workspaceId, contactId: id, status: { not: 'CANCELLED' } },
      }),
    ])

    const messages = thread
      ? await this.prisma.message.findMany({ where: { threadId: thread.id } })
      : []

    type HistoryEntry = {
      id:         string
      kind:       'email' | 'message' | 'meeting'
      occurredAt: Date
      title:      string
      body:       string | null
      status?:    string
      error?:     string | null
      direction?: string
    }

    const emailEntries: HistoryEntry[] = emails.map(e => ({
      id:         e.id,
      kind:       'email',
      occurredAt: e.sentAt,
      title:      e.subject,
      body:       e.body,
      status:     e.status,
      error:      e.error,
    }))

    const messageEntries: HistoryEntry[] = messages.map(m => ({
      id:         m.id,
      kind:       'message',
      occurredAt: m.createdAt,
      title:      m.body.replace(/<[^>]*>/g, '').slice(0, 60),
      body:       m.body,
      direction:  m.senderType,
    }))

    const meetingEntries: HistoryEntry[] = meetings.map(m => ({
      id:         m.id,
      kind:       'meeting',
      occurredAt: m.scheduledAt,
      title:      m.title,
      body:       m.agenda,
      status:     m.status,
    }))

    const all = [...emailEntries, ...messageEntries, ...meetingEntries]
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())

    const total = all.length
    const start = (page - 1) * limit
    const items = all.slice(start, start + limit)

    return { items, total, page, limit }
  }

  async getOverviewStats(workspaceId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({ where: { id, workspaceId } })
    if (!contact) throw new NotFoundException('Contact not found')

    const totalHoursResult = await this.prisma.timeEntry.aggregate({
      where: { workspaceId, contactId: id },
      _sum:  { durationMins: true },
    })
    const totalHours = Number(((totalHoursResult._sum.durationMins ?? 0) / 60).toFixed(1))

    const monthlyHours: { month: string; hours: number }[] = []
    const now = new Date()

    for (let i = 5; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const end   = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59)

      const result = await this.prisma.timeEntry.aggregate({
        where: { workspaceId, contactId: id, date: { gte: start, lte: end } },
        _sum:  { durationMins: true },
      })

      monthlyHours.push({
        month: start.toLocaleString('en-IN', { month: 'short', year: '2-digit' }),
        hours: Number(((result._sum.durationMins ?? 0) / 60).toFixed(1)),
      })
    }

    return { totalHours, monthlyHours }
  }

  async update(workspaceId: string, id: string, dto: UpdateContactDto) {
    await this.findOne(workspaceId, id)
    return this.prisma.contact.update({
      where: { id },
      data:  {
        ...dto,
        phone:          dto.phone !== undefined ? normalizePhone(dto.phone) : undefined,
        dealValue:      dto.dealValue  !== undefined ? new Decimal(dto.dealValue) : undefined,
        followUpAt:     dto.followUpAt ? new Date(dto.followUpAt)                 : undefined,
        lastActivityAt: new Date(),
      },
    })
  }

  async updateStage(workspaceId: string, id: string, stage: ContactStage, lostReason?: string) {
    const existing = await this.findOne(workspaceId, id)
    if (!existing.archivedAt) {
      if (ACTIVE_STAGES.includes(stage) && !ACTIVE_STAGES.includes(existing.stage)) {
        await this.entitlements.assertWithinLimit(workspaceId, 'activeLeads')
      }
      if ((stage === 'CLIENT' || stage === 'PAST_CLIENT') && existing.stage !== 'CLIENT' && existing.stage !== 'PAST_CLIENT') {
        await this.entitlements.assertWithinLimit(workspaceId, 'clients')
      }
    }
    const contact = await this.prisma.contact.update({
      where: { id },
      data:  {
        stage,
        lastActivityAt: new Date(),
        ...(stage === ContactStage.LOST ? { lostReason: lostReason ?? null } : { lostReason: null }),
      },
    })
    this.eventEmitter.emit('contact.stage_changed', { entityId: id, workspaceId, stage })
    return contact
  }

  async archive(workspaceId: string, id: string) {
    const contact = await this.findOne(workspaceId, id)
    if (contact.archivedAt) throw new BadRequestException('Contact is already archived')
    return this.prisma.contact.update({ where: { id }, data: { archivedAt: new Date() } })
  }

  async unarchive(workspaceId: string, id: string) {
    const contact = await this.findOne(workspaceId, id)
    if (!contact.archivedAt) throw new BadRequestException('Contact is not archived')
    return this.prisma.contact.update({ where: { id }, data: { archivedAt: null } })
  }

  async remove(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id)
    const [proposals, contracts, invoices, projects, meetings] = await Promise.all([
      this.prisma.proposal.count({ where: { contactId: id } }),
      this.prisma.contract.count({ where: { contactId: id } }),
      this.prisma.invoice.count({  where: { contactId: id } }),
      this.prisma.project.count({  where: { contactId: id } }),
      this.prisma.meeting.count({  where: { contactId: id } }),
    ])
    const total = proposals + contracts + invoices + projects + meetings
    if (total > 0) {
      const parts = [
        proposals && `${proposals} proposal${proposals > 1 ? 's' : ''}`,
        contracts && `${contracts} contract${contracts > 1 ? 's' : ''}`,
        invoices  && `${invoices} invoice${invoices > 1 ? 's' : ''}`,
        projects  && `${projects} project${projects > 1 ? 's' : ''}`,
        meetings  && `${meetings} meeting${meetings > 1 ? 's' : ''}`,
      ].filter(Boolean).join(', ')
      throw new BadRequestException(`Cannot delete: this contact has ${parts}. Archive instead.`)
    }
    await this.prisma.contact.delete({ where: { id } })
  }

  async listNotes(workspaceId: string, contactId: string) {
    const contact = await this.findOne(workspaceId, contactId)
    return this.prisma.clientNote.findMany({
      where:   { contactId: contact.id, workspaceId },
      orderBy: { createdAt: 'desc' },
    })
  }

  async createNote(workspaceId: string, contactId: string, content: string) {
    await this.findOne(workspaceId, contactId)
    return this.prisma.clientNote.create({
      data: { workspaceId, contactId, content },
    })
  }

  async deleteNote(workspaceId: string, contactId: string, noteId: string) {
    await this.findOne(workspaceId, contactId)
    await this.prisma.clientNote.deleteMany({ where: { id: noteId, workspaceId, contactId } })
  }

  async regeneratePortalToken(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id)
    const portalToken = nanoid(21)
    const contact = await this.prisma.contact.update({ where: { id }, data: { portalToken } })
    const appUrl = this.config.get<string>('appUrl')
    return { portalToken: contact.portalToken, portalUrl: `${appUrl}/portal/${contact.portalToken}` }
  }

  async getPipelineValue(workspaceId: string) {
    const result = await this.prisma.contact.aggregate({
      where: {
        workspaceId,
        archivedAt: null,
        stage:      { in: ACTIVE_STAGES },
        dealValue:  { not: null },
      },
      _sum:   { dealValue: true },
      _count: true,
    })
    return { total: result._sum.dealValue ?? 0, count: result._count }
  }
}

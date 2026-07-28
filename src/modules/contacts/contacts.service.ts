import {
  Injectable, NotFoundException, BadRequestException, HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { nanoid } from 'nanoid';
import Decimal from 'decimal.js';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { QueryContactsDto } from './dto/query-contacts.dto';
import { ContactStage } from '@prisma/client';
import { effectivePlan } from '../users/effective-plan';

const ACTIVE_STAGES: ContactStage[] = ['ENQUIRY', 'PROPOSAL_SENT', 'NEGOTIATING']

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma:       PrismaService,
    private readonly config:       ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(workspaceId: string, dto: CreateContactDto) {
    // Phase C plan limit: mirrors Lead limits for ENQUIRY-stage contacts
    const user = await this.prisma.user.findUnique({
      where:  { id: workspaceId },
      select: { plan: true, planExpiresAt: true, subscriptionStatus: true },
    })
    if (effectivePlan(user!) === 'FREE') {
      const count = await this.prisma.contact.count({
        where: { workspaceId, archivedAt: null, stage: { in: ACTIVE_STAGES } },
      })
      if (count >= 3) {
        throw new HttpException(
          { message: 'Free plan: 3 active contact limit reached.', code: 'PLAN_LIMIT' },
          402,
        )
      }
    }

    const contact = await this.prisma.$transaction(async (tx) => {
      const c = await tx.contact.create({
        data: {
          ...dto,
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
          select:  { id: true, invoiceNumber: true, status: true, total: true, dueDate: true, createdAt: true, paidAt: true },
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

  async update(workspaceId: string, id: string, dto: UpdateContactDto) {
    await this.findOne(workspaceId, id)
    return this.prisma.contact.update({
      where: { id },
      data:  {
        ...dto,
        dealValue:      dto.dealValue  !== undefined ? new Decimal(dto.dealValue) : undefined,
        followUpAt:     dto.followUpAt ? new Date(dto.followUpAt)                 : undefined,
        lastActivityAt: new Date(),
      },
    })
  }

  async updateStage(workspaceId: string, id: string, stage: ContactStage) {
    await this.findOne(workspaceId, id)
    const contact = await this.prisma.contact.update({
      where: { id },
      data:  { stage, lastActivityAt: new Date() },
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

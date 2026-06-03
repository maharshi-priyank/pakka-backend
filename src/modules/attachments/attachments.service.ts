import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateAttachmentDto } from './dto/create-attachment.dto'
import type { Attachment } from '@prisma/client'

type AttachmentWithGate = Attachment & { gateInvoice?: { status: string } | null }

@Injectable()
export class AttachmentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateAttachmentDto) {
    return this.prisma.attachment.create({
      data: {
        userId,
        projectId:    dto.projectId,
        proposalId:   dto.proposalId,
        invoiceId:    dto.invoiceId,
        clientId:     dto.clientId,
        gateInvoiceId: dto.gateInvoiceId,
        fileName:  dto.fileName,
        fileUrl:   dto.fileUrl,
        fileSize:  dto.fileSize,
        mimeType:  dto.mimeType,
      },
    })
  }

  async list(userId: string, query: { projectId?: string; proposalId?: string; invoiceId?: string; clientId?: string }) {
    return this.prisma.attachment.findMany({
      where: { userId, ...query },
      orderBy: { createdAt: 'asc' },
    })
  }

  async remove(userId: string, id: string) {
    const attachment = await this.prisma.attachment.findUnique({ where: { id } })
    if (!attachment) throw new NotFoundException('Attachment not found')
    if (attachment.userId !== userId) throw new ForbiddenException()
    await this.prisma.attachment.delete({ where: { id } })
  }

  async listPublicForProposal(proposalId: string) {
    return this.prisma.attachment.findMany({
      where: { proposalId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, fileName: true, fileSize: true, mimeType: true, fileUrl: true, createdAt: true },
    })
  }

  async listPublicForInvoice(invoiceId: string) {
    const attachments = await this.prisma.attachment.findMany({
      where: { invoiceId },
      orderBy: { createdAt: 'asc' },
      include: { gateInvoice: { select: { status: true } } },
    })
    return attachments.map((a: AttachmentWithGate) => this.applyGate(a))
  }

  async listPublicForPortal(portalToken: string) {
    const client = await this.prisma.client.findUnique({
      where: { portalToken },
      select: {
        id: true,
        proposals: { select: { id: true, title: true } },
        invoices:  { select: { id: true, invoiceNumber: true, status: true } },
        projects:  { select: { id: true, name: true } },
      },
    })
    if (!client) throw new NotFoundException('Portal not found')

    const proposalIds = client.proposals.map((p: { id: string }) => p.id)
    const invoiceIds  = client.invoices.map((i: { id: string }) => i.id)
    const projectIds  = client.projects.map((p: { id: string }) => p.id)

    const attachments = await this.prisma.attachment.findMany({
      where: {
        OR: [
          { clientId:  client.id },
          { proposalId: { in: proposalIds } },
          { invoiceId:  { in: invoiceIds  } },
          { projectId:  { in: projectIds  } },
        ],
      },
      include: { gateInvoice: { select: { status: true } } },
      orderBy: { createdAt: 'desc' },
    })

    const proposalMap = Object.fromEntries(client.proposals.map((p: { id: string; title: string }) => [p.id, p.title]))
    const invoiceMap  = Object.fromEntries(client.invoices.map((i: { id: string; invoiceNumber: string }) => [i.id, i.invoiceNumber]))
    const projectMap  = Object.fromEntries(client.projects.map((p: { id: string; name: string }) => [p.id, p.name]))

    return attachments.map((a: AttachmentWithGate) => {
      const gated = this.applyGate(a)
      let parentLabel: string | null = null
      if (a.proposalId) parentLabel = `From Proposal: ${proposalMap[a.proposalId] ?? a.proposalId}`
      else if (a.invoiceId) parentLabel = `From Invoice: ${invoiceMap[a.invoiceId] ?? a.invoiceId}`
      else if (a.projectId) parentLabel = `From Project: ${projectMap[a.projectId] ?? a.projectId}`
      return { ...gated, parentLabel }
    })
  }

  private applyGate(attachment: AttachmentWithGate) {
    if (!attachment.gateInvoiceId) {
      const { gateInvoice: _, ...rest } = attachment
      return rest
    }
    const isPaid = attachment.gateInvoice?.status === 'PAID'
    const { gateInvoice: _, ...rest } = attachment
    return { ...rest, fileUrl: isPaid ? rest.fileUrl : null }
  }
}

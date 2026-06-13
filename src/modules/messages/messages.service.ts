import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { NotificationsService } from '../notifications/notifications.service'
import { EmailService } from '../automations/email.service'
import { layout } from '../automations/templates/email-templates'
import type { SendMessageDto } from './dto/send-message.dto'

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma:        PrismaService,
    private readonly notifications: NotificationsService,
    private readonly emailService:  EmailService,
  ) {}

  private async getOrCreateThread(userId: string, clientId: string, subject?: string) {
    const existing = await this.prisma.thread.findUnique({
      where: { userId_clientId: { userId, clientId } },
    })
    if (existing) return existing
    const client = await this.prisma.client.findFirst({ where: { id: clientId, userId } })
    if (!client) throw new NotFoundException('Client not found')
    return this.prisma.thread.create({
      data: { userId, clientId, subject: subject ?? null },
    })
  }

  async listThreads(userId: string) {
    const threads = await this.prisma.thread.findMany({
      where:   { userId },
      include: {
        client:   { select: { id: true, name: true, email: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { updatedAt: 'desc' },
    })
    const unreadCounts = await Promise.all(
      threads.map(t =>
        this.prisma.message.count({
          where: { threadId: t.id, senderType: 'CLIENT', readAt: null },
        })
      )
    )
    return threads.map((t, i) => ({
      id:            t.id,
      subject:       t.subject,
      client:        t.client,
      latestMessage: t.messages[0] ?? null,
      unreadCount:   unreadCounts[i],
      updatedAt:     t.updatedAt,
    }))
  }

  async getThread(userId: string, clientId: string) {
    const thread = await this.getOrCreateThread(userId, clientId)
    const messages = await this.prisma.message.findMany({
      where:   { threadId: thread.id },
      orderBy: { createdAt: 'asc' },
    })
    const client = await this.prisma.client.findFirst({
      where:  { id: clientId, userId },
      select: { id: true, name: true, email: true },
    })
    return { thread, messages, client }
  }

  async sendMessage(userId: string, clientId: string, dto: SendMessageDto) {
    if (dto.attachmentType && dto.attachmentId) {
      await this.validateAttachment(userId, clientId, dto.attachmentType, dto.attachmentId)
    }

    const thread = await this.getOrCreateThread(userId, clientId, dto.subject)

    if (dto.subject && !thread.subject) {
      await this.prisma.thread.update({ where: { id: thread.id }, data: { subject: dto.subject } })
    }
    await this.prisma.thread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } })

    const message = await this.prisma.message.create({
      data: {
        threadId:       thread.id,
        senderType:     'FREELANCER',
        body:           dto.body,
        attachmentType: dto.attachmentType ?? null,
        attachmentId:   dto.attachmentId   ?? null,
      },
    })

    const user   = await this.prisma.user.findUnique({ where: { id: userId } })
    const client = await this.prisma.client.findUnique({ where: { id: clientId } })
    if (client?.email && user) {
      const portalUrl = `${process.env.PORTAL_BASE_URL ?? 'https://app.getclearwork.in/portal'}/${client.portalToken}#messages`
      const subject   = thread.subject ?? `New message from ${user.businessName ?? user.name}`
      const content   = `<p style="margin:0 0 16px;font-size:15px;color:#374151;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">Hi ${client.name},</p>
         <p style="margin:0 0 16px;font-size:15px;color:#374151;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">${user.businessName ?? user.name} sent you a message:</p>
         <blockquote style="margin:0 0 20px;padding:12px 16px;border-left:3px solid #6366F1;background:#F5F3FF;border-radius:0 8px 8px 0;font-size:14px;color:#374151;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">${dto.body}</blockquote>
         <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
           <tr><td style="border-radius:8px;background:#4F46E5;"><a href="${portalUrl}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">Reply in your portal</a></td></tr>
         </table>`
      const html = layout(content, user.businessName ?? user.name, `New message from ${user.businessName ?? user.name}`)
      void this.emailService.send({
        userId,
        to:          client.email,
        subject,
        html,
        templateKey: 'message_received',
        entityId:    message.id,
        entityType:  'message',
      }).catch(() => { /* non-blocking */ })
    }

    return message
  }

  async markRead(userId: string, clientId: string) {
    const thread = await this.prisma.thread.findUnique({
      where: { userId_clientId: { userId, clientId } },
    })
    if (!thread) return
    await this.prisma.message.updateMany({
      where: { threadId: thread.id, senderType: 'CLIENT', readAt: null },
      data:  { readAt: new Date() },
    })
  }

  async getUnreadCount(userId: string): Promise<number> {
    const threads = await this.prisma.thread.findMany({
      where:  { userId },
      select: { id: true },
    })
    if (!threads.length) return 0
    return this.prisma.message.count({
      where: {
        threadId:   { in: threads.map(t => t.id) },
        senderType: 'CLIENT',
        readAt:     null,
      },
    })
  }

  // ── Portal (client side) ─────────────────────────────────────────────────────

  async getThreadByToken(token: string) {
    const client = await this.prisma.client.findUnique({ where: { portalToken: token } })
    if (!client) throw new NotFoundException('Portal link invalid')
    const thread = await this.getOrCreateThread(client.userId, client.id)
    const messages = await this.prisma.message.findMany({
      where:   { threadId: thread.id },
      orderBy: { createdAt: 'asc' },
    })
    const user = await this.prisma.user.findUnique({
      where:  { id: client.userId },
      select: { businessName: true, name: true, emailSignature: true },
    })
    return { thread, messages, businessName: user?.businessName ?? user?.name ?? 'Your service provider' }
  }

  async sendReply(token: string, body: string) {
    const client = await this.prisma.client.findUnique({ where: { portalToken: token } })
    if (!client) throw new NotFoundException('Portal link invalid')
    const thread = await this.getOrCreateThread(client.userId, client.id)
    await this.prisma.thread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } })

    const message = await this.prisma.message.create({
      data: { threadId: thread.id, senderType: 'CLIENT', body },
    })

    void this.notifications.create({
      userId:     client.userId,
      type:       'MESSAGE_RECEIVED',
      title:      `${client.name} replied`,
      body:       body.replace(/<[^>]*>/g, '').slice(0, 120),
      entityId:   message.id,
      entityType: 'message',
      url:        `/app/inbox?client=${client.id}`,
    }).catch(() => {})

    const user = await this.prisma.user.findUnique({ where: { id: client.userId } })
    if (user?.email) {
      const inboxUrl = `https://app.getclearwork.in/app/inbox?client=${client.id}`
      const replySubject = `${client.name} replied to your message`
      const content = `<p style="margin:0 0 16px;font-size:15px;color:#374151;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">Hi ${user.name},</p>
         <p style="margin:0 0 16px;font-size:15px;color:#374151;font-family:Arial,Helvetica,sans-serif;line-height:1.6;"><strong>${client.name}</strong> replied to your message:</p>
         <blockquote style="margin:0 0 20px;padding:12px 16px;border-left:3px solid #6366F1;background:#F5F3FF;border-radius:0 8px 8px 0;font-size:14px;color:#374151;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">${body}</blockquote>
         <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
           <tr><td style="border-radius:8px;background:#4F46E5;"><a href="${inboxUrl}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;">View in inbox</a></td></tr>
         </table>`
      const html = layout(content, user.businessName ?? user.name, replySubject)
      void this.emailService.send({
        userId:     client.userId,
        to:         user.email,
        subject:    replySubject,
        html,
        templateKey: 'client_message_received',
        entityId:    message.id,
        entityType:  'message',
      }).catch(() => {})
    }

    return message
  }

  async markReadByToken(token: string) {
    const client = await this.prisma.client.findUnique({ where: { portalToken: token } })
    if (!client) return
    const thread = await this.prisma.thread.findUnique({
      where: { userId_clientId: { userId: client.userId, clientId: client.id } },
    })
    if (!thread) return
    await this.prisma.message.updateMany({
      where: { threadId: thread.id, senderType: 'FREELANCER', readAt: null },
      data:  { readAt: new Date() },
    })
  }

  private async validateAttachment(
    userId: string, clientId: string,
    type: 'PROPOSAL' | 'INVOICE' | 'CONTRACT', id: string,
  ) {
    if (type === 'PROPOSAL') {
      const p = await this.prisma.proposal.findFirst({ where: { id, userId, clientId } })
      if (!p) throw new BadRequestException('Proposal not found for this client')
    } else if (type === 'INVOICE') {
      const i = await this.prisma.invoice.findFirst({ where: { id, userId, clientId } })
      if (!i) throw new BadRequestException('Invoice not found for this client')
    } else if (type === 'CONTRACT') {
      const c = await this.prisma.contract.findFirst({ where: { id, userId, clientId } })
      if (!c) throw new BadRequestException('Contract not found for this client')
    }
  }
}

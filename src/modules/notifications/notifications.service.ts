import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PushService } from './push.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push:   PushService,
  ) {}

  async create(opts: {
    userId:      string
    type:        string
    title:       string
    body:        string
    entityId?:   string
    entityType?: string
    /** Optional in-app URL to open when the push is tapped (defaults inferred from entityType) */
    url?:        string
  }) {
    const notification = await this.prisma.notification.create({ data: {
      workspaceId: opts.userId,
      type:        opts.type,
      title:       opts.title,
      body:        opts.body,
      entityId:    opts.entityId,
      entityType:  opts.entityType,
    } });

    // Fire-and-forget push delivery — don't block the in-app notification path
    void this.push.sendToUser(opts.userId, {
      title: opts.title,
      body:  opts.body,
      type:  opts.type,
      tag:   opts.type,        // collapse duplicates of the same kind
      url:   opts.url ?? this.urlFor(opts.entityType, opts.entityId),
    }).catch(() => { /* push failures shouldn't break the API */ });

    return notification;
  }

  async findAll(userId: string) {
    return this.prisma.notification.findMany({
      where:   { workspaceId: userId },
      orderBy: { createdAt: 'desc' },
      take:    30,
    });
  }

  async getUnreadCount(userId: string) {
    return this.prisma.notification.count({ where: { workspaceId: userId, read: false } });
  }

  async markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, workspaceId: userId },
      data:  { read: true },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { workspaceId: userId, read: false },
      data:  { read: true },
    });
  }

  private urlFor(entityType?: string, entityId?: string): string | undefined {
    if (!entityType || !entityId) return undefined;
    switch (entityType) {
      case 'invoice':  return `/app/invoices/${entityId}`;
      case 'proposal': return `/app/proposals/${entityId}`;
      case 'contract': return `/app/contracts/${entityId}`;
      case 'lead':     return `/app/leads`;
      case 'meeting':  return `/app/meetings`;
      case 'form':     return `/app/forms`;
      default:         return undefined;
    }
  }
}

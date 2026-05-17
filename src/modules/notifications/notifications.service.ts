import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(opts: {
    userId:      string
    type:        string
    title:       string
    body:        string
    entityId?:   string
    entityType?: string
  }) {
    return this.prisma.notification.create({ data: opts });
  }

  async findAll(userId: string) {
    return this.prisma.notification.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      take:    30,
    });
  }

  async getUnreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, read: false } });
  }

  async markRead(userId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data:  { read: true },
    });
  }

  async markAllRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data:  { read: true },
    });
  }
}

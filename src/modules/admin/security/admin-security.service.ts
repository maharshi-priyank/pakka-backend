import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AdminSecurityQueryDto } from './dto/admin-security-query.dto';

interface SecurityRange { from: Date; to: Date }

@Injectable()
export class AdminSecurityService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(query: AdminSecurityQueryDto = {}) {
    const range = this.resolveRange(query);
    const where = this.where(query, range);
    const [total, failures, successes, recentFailures, affectedEmails] = await Promise.all([
      this.prisma.adminSecurityEvent.count({ where }),
      this.prisma.adminSecurityEvent.count({ where: { ...where, outcome: 'FAILURE' } }),
      this.prisma.adminSecurityEvent.count({ where: { ...where, outcome: 'SUCCESS' } }),
      this.prisma.adminSecurityEvent.findMany({
        where: { outcome: 'FAILURE', at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        select: { email: true, at: true },
        orderBy: { at: 'desc' },
        take: 500,
      }),
      this.prisma.adminSecurityEvent.findMany({
        where: { ...where, outcome: 'FAILURE' },
        distinct: ['email'],
        select: { email: true },
        orderBy: { at: 'desc' },
        take: 50,
      }),
    ]);

    return {
      range: this.serializeRange(range),
      counts: { total, failures, successes },
      recentFailureRate: total ? Number(((failures / total) * 100).toFixed(1)) : 0,
      failedAttemptsLast24h: recentFailures.length,
      affectedEmails: affectedEmails.map((item) => item.email),
      dataQuality: { historicalBeforePhase3Available: false as const },
    };
  }

  async events(query: AdminSecurityQueryDto = {}) {
    const range = this.resolveRange(query);
    const where = this.where(query, range);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const [events, total] = await Promise.all([
      this.prisma.adminSecurityEvent.findMany({
        where,
        orderBy: { at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, adminId: true, email: true, outcome: true, ipAddress: true, userAgent: true, at: true },
      }),
      this.prisma.adminSecurityEvent.count({ where }),
    ]);
    const adminIds = [...new Set(events.flatMap((event) => event.adminId ? [event.adminId] : []))];
    const admins = await this.prisma.adminUser.findMany({
      where: { id: { in: adminIds } },
      select: { id: true, name: true, email: true, role: true },
    });
    const adminById = new Map(admins.map((admin) => [admin.id, admin]));

    return {
      items: events.map((event) => ({
        ...event,
        ipAddress: event.ipAddress ? this.redactIp(event.ipAddress) : null,
        userAgent: event.userAgent ? event.userAgent.slice(0, 160) : null,
        admin: event.adminId ? adminById.get(event.adminId) ?? null : null,
      })),
      total,
      page,
      pageSize,
      range: this.serializeRange(range),
    };
  }

  private where(query: AdminSecurityQueryDto, range: SecurityRange) {
    return {
      at: { gte: range.from, lt: range.to },
      ...(query.outcome ? { outcome: query.outcome } : {}),
      ...(query.email ? { email: { contains: query.email.trim(), mode: 'insensitive' as const } } : {}),
    };
  }

  private resolveRange(query: AdminSecurityQueryDto): SecurityRange {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from >= to) {
      throw new BadRequestException('Invalid security event date range.');
    }
    if (to.getTime() - from.getTime() > 90 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException('Security event date range cannot exceed 90 days.');
    }
    return { from, to };
  }

  private serializeRange(range: SecurityRange) {
    return { from: range.from.toISOString(), to: range.to.toISOString() };
  }

  private redactIp(ip: string) {
    if (ip.includes(':')) return `${ip.split(':').slice(0, 4).join(':')}:…`;
    const parts = ip.split('.');
    return parts.length === 4 ? `${parts.slice(0, 3).join('.')}.…` : 'redacted';
  }
}

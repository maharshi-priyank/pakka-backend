import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class AdminSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(rawQuery: string, requestedLimit = 8) {
    const query = rawQuery.trim();
    const limit = Math.min(Math.max(requestedLimit, 1), 20);
    const contains = { contains: query, mode: 'insensitive' as const };

    const [users, workspaces, invoices] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          OR: [
            { email: contains },
            { name: contains },
            { razorpaySubscriptionId: contains },
            { stripeSubscriptionId: contains },
          ],
        },
        select: {
          id: true,
          email: true,
          name: true,
          plan: true,
          subscriptionStatus: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.workspace.findMany({
        where: { OR: [{ name: contains }, { businessName: contains }] },
        select: { id: true, name: true, businessName: true, archivedAt: true },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.invoice.findMany({
        where: { invoiceNumber: contains },
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          total: true,
          currency: true,
          workspace: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
    ]);

    return {
      query,
      users,
      workspaces,
      invoices: invoices.map((invoice) => ({
        ...invoice,
        total: invoice.total.toString(),
      })),
    };
  }
}

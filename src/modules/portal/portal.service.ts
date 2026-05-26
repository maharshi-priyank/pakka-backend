import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import Razorpay from 'razorpay';

@Injectable()
export class PortalService {
  private razorpay: Razorpay;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.razorpay = new Razorpay({
      key_id:     this.config.get<string>('razorpay.keyId')!,
      key_secret: this.config.get<string>('razorpay.keySecret')!,
    });
  }

  async getPortalData(token: string) {
    const client = await this.prisma.client.findUnique({
      where: { portalToken: token },
      include: { user: { select: { businessName: true, logoUrl: true, email: true } } },
    });
    if (!client) throw new NotFoundException('Portal link is invalid or has expired');

    const [proposals, contracts, invoices, meetings, projects] = await Promise.all([
      this.prisma.proposal.findMany({
        where: { clientId: client.id, status: { not: 'DRAFT' } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, title: true, status: true, slug: true,
          totalAmount: true, gstAmount: true, validUntil: true,
          acceptedAt: true, createdAt: true,
        },
      }),
      this.prisma.contract.findMany({
        where: { clientId: client.id, status: { not: 'DRAFT' } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, status: true, signedAt: true, createdAt: true },
      }),
      this.prisma.invoice.findMany({
        where: { clientId: client.id, status: { not: 'DRAFT' } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, invoiceNumber: true, status: true,
          total: true, dueDate: true, paidAt: true, createdAt: true,
        },
      }),
      this.prisma.meeting.findMany({
        where: { clientId: client.id, status: { not: 'CANCELLED' } },
        orderBy: { scheduledAt: 'asc' },
        select: {
          id: true, title: true, agenda: true,
          scheduledAt: true, durationMins: true, meetLink: true, status: true,
        },
      }),
      this.prisma.project.findMany({
        where:   { clientId: client.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, name: true, status: true, budget: true,
          startDate: true, endDate: true, shareRateWithClient: true,
          timeEntries: {
            orderBy: { date: 'desc' },
            select: { id: true, description: true, date: true, durationMins: true, hourlyRate: true, isBilled: true },
          },
          expenses: {
            where:   { isBillable: true },
            orderBy: { date: 'desc' },
            select: { id: true, description: true, category: true, amount: true, date: true, isBilled: true },
          },
        },
      }),
    ]);

    return {
      client: {
        id:      client.id,
        name:    client.name,
        email:   client.email,
        company: client.company,
      },
      freelancer: {
        businessName: client.user.businessName,
        logoUrl:      client.user.logoUrl,
      },
      proposals,
      contracts,
      invoices,
      meetings,
      projects,
    };
  }

  async createInvoiceOrder(token: string, invoiceId: string) {
    const client = await this.prisma.client.findUnique({ where: { portalToken: token } });
    if (!client) throw new NotFoundException('Portal link is invalid or has expired');

    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, clientId: client.id },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (!['SENT', 'OVERDUE', 'VIEWED'].includes(invoice.status)) {
      throw new BadRequestException('Invoice is not payable');
    }

    const amountPaise = Math.round(Number(invoice.total) * 100);
    const order = await (this.razorpay.orders.create as any)({
      amount:   amountPaise,
      currency: 'INR',
      receipt:  invoice.invoiceNumber,
    });

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data:  { razorpayOrderId: order.id },
    });

    return {
      orderId:  order.id,
      amount:   amountPaise,
      currency: 'INR',
      keyId:    this.config.get<string>('razorpay.keyId'),
    };
  }
}

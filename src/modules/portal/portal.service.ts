import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import Razorpay from 'razorpay';
import { effectivePlan } from '../users/effective-plan';

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  private makeRazorpay(keyId: string | null, keySecret: string | null): Razorpay {
    if (!keyId || !keySecret) {
      throw new BadRequestException('Connect your Razorpay account in Settings to enable online payments')
    }
    return new Razorpay({ key_id: keyId, key_secret: keySecret })
  }

  async getPortalData(token: string) {
    // Phase C: check Contact.portalToken first (new contacts), then Client.portalToken (legacy)
    const contact = await this.prisma.contact.findFirst({
      where:   { portalToken: token },
      include: { workspace: { select: { businessName: true, logoUrl: true, razorpayKeyId: true, razorpayKeySecret: true } } },
    });

    if (contact) {
      return this.getPortalDataForContact(contact, token);
    }

    const client = await this.prisma.client.findUnique({
      where: { portalToken: token },
      include: { workspace: { select: { businessName: true, logoUrl: true, razorpayKeyId: true, razorpayKeySecret: true } } },
    });
    if (!client) throw new NotFoundException('Portal link is invalid or has expired');
    return this.getPortalDataForClient(client);
  }

  private async getPortalDataForContact(
    contact: Awaited<ReturnType<typeof this.prisma.contact.findFirst>> & { workspace: { businessName: string | null; logoUrl: string | null; razorpayKeyId: string | null; razorpayKeySecret: string | null } },
    _token: string,
  ) {
    const owner = await this.prisma.user.findUnique({
      where:  { id: contact!.workspaceId },
      select: { plan: true, planExpiresAt: true, subscriptionStatus: true },
    });

    const [proposals, contracts, invoices, meetings, projects] = await Promise.all([
      this.prisma.proposal.findMany({
        where: { contactId: contact!.id, status: { not: 'DRAFT' } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, title: true, status: true, slug: true,
          totalAmount: true, gstAmount: true, validUntil: true,
          acceptedAt: true, createdAt: true,
        },
      }),
      this.prisma.contract.findMany({
        where: { contactId: contact!.id, status: { not: 'DRAFT' } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, status: true, signedAt: true, createdAt: true },
      }),
      this.prisma.invoice.findMany({
        where: { contactId: contact!.id, status: { not: 'DRAFT' } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, invoiceNumber: true, status: true,
          total: true, dueDate: true, paidAt: true, createdAt: true,
        },
      }),
      this.prisma.meeting.findMany({
        where: { contactId: contact!.id, status: { not: 'CANCELLED' } },
        orderBy: { scheduledAt: 'asc' },
        select: {
          id: true, title: true, agenda: true,
          scheduledAt: true, durationMins: true, meetLink: true, status: true,
        },
      }),
      this.prisma.project.findMany({
        where:   { contactId: contact!.id },
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
        id:        contact!.id,
        name:      contact!.name,
        email:     contact!.email,
        company:   contact!.company,
      },
      freelancer: {
        businessName: contact!.workspace.businessName,
        logoUrl:      contact!.workspace.logoUrl,
        hideBranding: effectivePlan(owner!) === 'STUDIO',
      },
      proposals,
      contracts,
      invoices,
      meetings,
      projects,
    };
  }

  private async getPortalDataForClient(
    client: Awaited<ReturnType<typeof this.prisma.client.findUnique>> & { workspace: { businessName: string | null; logoUrl: string | null; razorpayKeyId: string | null; razorpayKeySecret: string | null } },
  ) {
    const owner = await this.prisma.user.findUnique({
      where: { id: client!.workspaceId },
      select: { plan: true, planExpiresAt: true, subscriptionStatus: true },
    });

    const [proposals, contracts, invoices, meetings, projects] = await Promise.all([
      this.prisma.proposal.findMany({
        where: { clientId: client!.id, status: { not: 'DRAFT' } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, title: true, status: true, slug: true,
          totalAmount: true, gstAmount: true, validUntil: true,
          acceptedAt: true, createdAt: true,
        },
      }),
      this.prisma.contract.findMany({
        where: { clientId: client!.id, status: { not: 'DRAFT' } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, status: true, signedAt: true, createdAt: true },
      }),
      this.prisma.invoice.findMany({
        where: { clientId: client!.id, status: { not: 'DRAFT' } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, invoiceNumber: true, status: true,
          total: true, dueDate: true, paidAt: true, createdAt: true,
        },
      }),
      this.prisma.meeting.findMany({
        where: { clientId: client!.id, status: { not: 'CANCELLED' } },
        orderBy: { scheduledAt: 'asc' },
        select: {
          id: true, title: true, agenda: true,
          scheduledAt: true, durationMins: true, meetLink: true, status: true,
        },
      }),
      this.prisma.project.findMany({
        where:   { clientId: client!.id },
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
        id:      client!.id,
        name:    client!.name,
        email:   client!.email,
        company: client!.company,
      },
      freelancer: {
        businessName: client!.workspace.businessName,
        logoUrl:      client!.workspace.logoUrl,
        hideBranding: effectivePlan(owner!) === 'STUDIO',
      },
      proposals,
      contracts,
      invoices,
      meetings,
      projects,
    };
  }

  async createInvoiceOrder(token: string, invoiceId: string) {
    // Phase C: resolve by contact first, then client
    const contact = await this.prisma.contact.findFirst({
      where:   { portalToken: token },
      include: { workspace: { select: { razorpayKeyId: true, razorpayKeySecret: true } } },
    });

    let workspaceInfo: { razorpayKeyId: string | null; razorpayKeySecret: string | null }
    let invoiceWhere: Record<string, string>

    if (contact) {
      workspaceInfo = contact.workspace
      invoiceWhere  = { id: invoiceId, contactId: contact.id }
    } else {
      const client = await this.prisma.client.findUnique({
        where:   { portalToken: token },
        include: { workspace: { select: { razorpayKeyId: true, razorpayKeySecret: true } } },
      });
      if (!client) throw new NotFoundException('Portal link is invalid or has expired');
      workspaceInfo = client.workspace
      invoiceWhere  = { id: invoiceId, clientId: client.id }
    }

    const invoice = await this.prisma.invoice.findFirst({ where: invoiceWhere });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (!['SENT', 'OVERDUE', 'VIEWED'].includes(invoice.status)) {
      throw new BadRequestException('Invoice is not payable');
    }

    const razorpay = this.makeRazorpay(workspaceInfo.razorpayKeyId, workspaceInfo.razorpayKeySecret);

    const amountPaise = Math.round(Number(invoice.total) * 100);
    const order = await (razorpay.orders.create as any)({
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
      keyId:    workspaceInfo.razorpayKeyId,
    };
  }
}

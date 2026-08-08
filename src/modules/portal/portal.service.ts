import { Injectable, NotFoundException, BadRequestException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import Razorpay from 'razorpay';
import * as crypto from 'crypto';
import { effectivePlan } from '../users/effective-plan';

@Injectable()
export class PortalService {
  constructor(
    private readonly prisma:       PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private makeRazorpay(keyId: string | null, keySecret: string | null): Razorpay {
    if (!keyId || !keySecret) {
      throw new BadRequestException('Connect your Razorpay account in Settings to enable online payments')
    }
    return new Razorpay({ key_id: keyId, key_secret: keySecret })
  }

  /**
   * Resolve a portal token to its workspace context.
   * Tries Contact.portalToken first (Phase C), then legacy Client.portalToken.
   * Returns { workspaceId, email, name }.
   */
  async resolveToken(token: string): Promise<{ workspaceId: string; email: string; name: string }> {
    const contact = await this.prisma.contact.findFirst({
      where:  { portalToken: token },
      select: { workspaceId: true, email: true, name: true },
    })
    if (contact) {
      return { workspaceId: contact.workspaceId, email: contact.email ?? '', name: contact.name }
    }

    const client = await this.prisma.client.findUnique({
      where:  { portalToken: token },
      select: { workspaceId: true, email: true, name: true },
    })
    if (!client) throw new NotFoundException('Portal link is invalid or has expired')
    return { workspaceId: client.workspaceId, email: client.email ?? '', name: client.name }
  }

  /**
   * Resolve a portal token AND verify the requested projectId belongs to that workspace.
   * Throws ForbiddenException if the project is not in the resolved workspace.
   */
  async resolveTokenForProject(
    token:     string,
    projectId: string,
  ): Promise<{ workspaceId: string; email: string; name: string }> {
    const resolved = await this.resolveToken(token)

    const project = await this.prisma.project.findFirst({
      where:  { id: projectId, workspaceId: resolved.workspaceId },
      select: { id: true },
    })
    if (!project) throw new ForbiddenException()

    return resolved
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
          acceptedAt: true, createdAt: true, projectId: true,
        },
      }),
      this.prisma.contract.findMany({
        where: { contactId: contact!.id, status: { not: 'DRAFT' } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, status: true, signedAt: true, createdAt: true, projectId: true },
      }),
      this.prisma.invoice.findMany({
        where: { contactId: contact!.id, status: { not: 'DRAFT' } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, invoiceNumber: true, status: true,
          total: true, dueDate: true, paidAt: true, createdAt: true, projectId: true,
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
          updates: {
            orderBy: { createdAt: 'desc' },
            select: { id: true, content: true, createdAt: true, author: { select: { id: true, name: true } } },
          },
          changeRequests: {
            select: {
              id: true,
              description: true,
              status: true,
              raisedByEmail: true,
              freelancerNote: true,
              createdAt: true,
              updatedAt: true,
              approvalRequests: {
                select: {
                  id: true,
                  kind: true,
                  status: true,
                  requiresOtp: true,
                  decisionNote: true,
                  decidedAt: true,
                  otpEmailSent: true,
                  createdAt: true,
                },
                orderBy: { createdAt: 'desc' },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
          approvalRequests: {
            where: { kind: 'PROJECT_SIGNOFF' },
            select: {
              id: true,
              kind: true,
              status: true,
              requiresOtp: true,
              decisionNote: true,
              decidedAt: true,
              otpEmailSent: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          },
          reviews: {
            select: { token: true, status: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
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
        stage:     contact!.stage,
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
          acceptedAt: true, createdAt: true, projectId: true,
        },
      }),
      this.prisma.contract.findMany({
        where: { clientId: client!.id, status: { not: 'DRAFT' } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, title: true, status: true, signedAt: true, createdAt: true, projectId: true },
      }),
      this.prisma.invoice.findMany({
        where: { clientId: client!.id, status: { not: 'DRAFT' } },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, invoiceNumber: true, status: true,
          total: true, dueDate: true, paidAt: true, createdAt: true, projectId: true,
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
          updates: {
            orderBy: { createdAt: 'desc' },
            select: { id: true, content: true, createdAt: true, author: { select: { id: true, name: true } } },
          },
          changeRequests: {
            select: {
              id: true,
              description: true,
              status: true,
              raisedByEmail: true,
              freelancerNote: true,
              createdAt: true,
              updatedAt: true,
              approvalRequests: {
                select: {
                  id: true,
                  kind: true,
                  status: true,
                  requiresOtp: true,
                  decisionNote: true,
                  decidedAt: true,
                  otpEmailSent: true,
                  createdAt: true,
                },
                orderBy: { createdAt: 'desc' },
              },
            },
            orderBy: { createdAt: 'desc' },
          },
          approvalRequests: {
            where: { kind: 'PROJECT_SIGNOFF' },
            select: {
              id: true,
              kind: true,
              status: true,
              requiresOtp: true,
              decisionNote: true,
              decidedAt: true,
              otpEmailSent: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          },
          reviews: {
            select: { token: true, status: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
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

  async verifyInvoicePayment(
    token: string,
    invoiceId: string,
    dto: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
  ) {
    // Resolve by contact first (Phase C), then legacy client — same pattern as createInvoiceOrder
    const contact = await this.prisma.contact.findFirst({
      where:   { portalToken: token },
      include: { workspace: { select: { razorpayKeySecret: true } } },
    });

    let workspaceId: string
    let razorpayKeySecret: string | null
    let invoiceWhere: Record<string, string>

    if (contact) {
      workspaceId       = contact.workspaceId
      razorpayKeySecret = contact.workspace.razorpayKeySecret
      invoiceWhere      = { id: invoiceId, contactId: contact.id }
    } else {
      const client = await this.prisma.client.findUnique({
        where:   { portalToken: token },
        include: { workspace: { select: { razorpayKeySecret: true } } },
      });
      if (!client) throw new NotFoundException('Portal link is invalid or has expired');
      workspaceId       = client.workspaceId
      razorpayKeySecret = client.workspace.razorpayKeySecret
      invoiceWhere      = { id: invoiceId, clientId: client.id }
    }

    const invoice = await this.prisma.invoice.findFirst({ where: invoiceWhere });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'PAID') {
      throw new BadRequestException('Invoice is already fully paid');
    }
    // The order must belong to THIS invoice — prevents a valid payment for a
    // different invoice/order being replayed to mark this one paid.
    if (!invoice.razorpayOrderId || invoice.razorpayOrderId !== dto.razorpayOrderId) {
      throw new BadRequestException('Order does not match this invoice');
    }
    if (!razorpayKeySecret) {
      throw new BadRequestException('Connect your Razorpay account in Settings to enable online payments');
    }

    const expectedSignature = crypto
      .createHmac('sha256', razorpayKeySecret)
      .update(`${dto.razorpayOrderId}|${dto.razorpayPaymentId}`)
      .digest('hex');

    const signatureValid =
      expectedSignature.length === dto.razorpaySignature.length &&
      crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(dto.razorpaySignature));

    if (!signatureValid) {
      throw new UnauthorizedException('Payment signature verification failed');
    }

    const paid = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data:  {
        status:          'PAID',
        amountPaid:      invoice.total,
        paidAt:          new Date(),
        razorpayPaymentId: dto.razorpayPaymentId,
      },
    });
    this.eventEmitter.emit('invoice.paid', { entityId: invoiceId, workspaceId });

    return { status: paid.status, paidAt: paid.paidAt };
  }
}

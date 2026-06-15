import { Injectable, NotFoundException, ForbiddenException, HttpException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';
import { PrismaService } from '../../prisma/prisma.service';
import { GstType, LeadStage, ProposalStatus } from '@prisma/client';
import { effectivePlan } from '../users/effective-plan';
import Decimal from 'decimal.js';
import { CreateProposalDto, LineItemDto } from './dto/create-proposal.dto';
import { UpdateProposalDto } from './dto/update-proposal.dto';
import { QueryProposalsDto } from './dto/query-proposals.dto';
import { VerifyDepositDto } from './dto/verify-deposit.dto';
import { InvoicesService } from '../invoices/invoices.service';

// Generates a short, URL-safe slug like "abc123xy"
function generateSlug(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function calcTotals(lineItems: LineItemDto[], gstType: string) {
  let subtotal = new Decimal(0);
  let gstAmount = new Decimal(0);

  for (const item of lineItems) {
    const lineTotal = new Decimal(item.qty).mul(item.rate);
    subtotal = subtotal.add(lineTotal);
    if (gstType !== 'EXEMPT' && item.gstRate) {
      gstAmount = gstAmount.add(lineTotal.mul(item.gstRate).div(100));
    }
  }

  return { subtotal, gstAmount, totalAmount: subtotal.add(gstAmount) };
}

@Injectable()
export class ProposalsService {
  constructor(
    private readonly prisma:        PrismaService,
    private readonly eventEmitter:  EventEmitter2,
    private readonly invoices:      InvoicesService,
  ) {}

  private makeRazorpay(keyId: string | null, keySecret: string | null): Razorpay {
    if (!keyId || !keySecret) {
      throw new BadRequestException('Connect your Razorpay account in Settings to enable online payments')
    }
    return new Razorpay({ key_id: keyId, key_secret: keySecret })
  }

  async create(workspaceId: string, dto: CreateProposalDto) {
    const user = await this.prisma.user.findUnique({ where: { id: workspaceId }, select: { plan: true, planExpiresAt: true, subscriptionStatus: true } });
    if (effectivePlan(user!) === 'FREE') {
      const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
      const count = await this.prisma.proposal.count({ where: { workspaceId, createdAt: { gte: start } } });
      if (count >= 3) throw new HttpException({ message: 'Free plan: 3 proposals/month limit reached.', code: 'PLAN_LIMIT' }, 402);
    }

    const lineItems = dto.content?.lineItems ?? [];
    const gstType   = dto.content?.gstType ?? 'IGST';
    const { subtotal, gstAmount, totalAmount } = calcTotals(lineItems, gstType);

    let slug: string;
    // Ensure slug uniqueness
    do { slug = generateSlug(); }
    while (await this.prisma.proposal.findUnique({ where: { slug } }));

    return this.prisma.proposal.create({
      data: {
        workspaceId,
        leadId:      dto.leadId,
        clientId:    dto.clientId,
        title:       dto.title,
        slug,
        content:     (dto.content ?? {}) as object,
        totalAmount,
        gstAmount,
        validUntil:  dto.validUntil ? new Date(dto.validUntil) : undefined,
        // Store client snapshot in content if provided without a clientId
        ...(dto.clientName && !dto.clientId
          ? { content: { ...(dto.content ?? {}), clientName: dto.clientName, clientEmail: dto.clientEmail } as object }
          : {}),
      },
      include: { lead: { select: { id: true, name: true } }, client: true, opens: true },
    });
  }

  async findAll(workspaceId: string, query: QueryProposalsDto) {
    const { page = 1, limit = 20, status, clientId, includeArchived } = query;
    const skip = (page - 1) * limit;

    const where = {
      workspaceId,
      ...(includeArchived ? {} : { archivedAt: null }),
      ...(status   && { status }),
      ...(clientId && { clientId }),
    };

    const [proposals, total] = await Promise.all([
      this.prisma.proposal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          lead:    { select: { id: true, name: true } },
          client:  { select: { id: true, name: true, company: true } },
          project: { select: { id: true, name: true } },
          opens:   { select: { id: true, openedAt: true } },
          _count:  { select: { opens: true } },
        },
      }),
      this.prisma.proposal.count({ where }),
    ]);

    return { items: proposals, total, page, limit };
  }

  async findOne(workspaceId: string, id: string) {
    const proposal = await this.prisma.proposal.findFirst({
      where: { id, workspaceId },
      include: {
        lead:      { select: { id: true, name: true, email: true } },
        client:    true,
        opens:     { orderBy: { openedAt: 'desc' }, take: 20 },
        contracts: { select: { id: true, status: true } },
        _count:    { select: { opens: true } },
      },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    return proposal;
  }

  async findBySlug(slug: string) {
    const proposal = await this.prisma.proposal.findUnique({
      where: { slug },
      include: {
        workspace:   { select: { name: true, businessName: true, logoUrl: true } },
        attachments: { orderBy: { createdAt: 'asc' }, select: { id: true, fileName: true, fileSize: true, mimeType: true, fileUrl: true, createdAt: true } },
      },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    const owner = await this.prisma.user.findUnique({
      where: { id: proposal.workspaceId },
      select: { email: true, plan: true, planExpiresAt: true, subscriptionStatus: true },
    });
    const hideBranding = effectivePlan(owner!) === 'STUDIO';
    const userPublic = { ...proposal.workspace, email: owner?.email ?? null };
    return { ...proposal, user: userPublic, hideBranding };
  }

  async update(workspaceId: string, id: string, dto: UpdateProposalDto) {
    const existing = await this.findOne(workspaceId, id);

    const lineItems = dto.content?.lineItems ?? (existing.content as Record<string, unknown>)?.lineItems as LineItemDto[] ?? [];
    const gstType   = dto.content?.gstType ?? (existing.content as Record<string, unknown>)?.gstType as string ?? 'IGST';
    const { subtotal, gstAmount, totalAmount } = calcTotals(lineItems, gstType);

    return this.prisma.proposal.update({
      where: { id },
      data: {
        ...(dto.title      && { title: dto.title }),
        ...(dto.leadId     && { leadId: dto.leadId }),
        ...(dto.clientId                !== undefined && { clientId:  dto.clientId }),
        ...(dto.projectId               !== undefined && { projectId: dto.projectId ?? null }),
        ...(dto.status     && { status: dto.status }),
        ...(dto.validUntil && { validUntil: new Date(dto.validUntil) }),
        ...(dto.content && {
          content: dto.content as object,
          totalAmount,
          gstAmount,
        }),
        ...(dto.hidePricingTable !== undefined && { hidePricingTable: dto.hidePricingTable }),
      },
      include: { lead: { select: { id: true, name: true } }, client: true, opens: true },
    });
  }

  async send(workspaceId: string, id: string) {
    const proposal = await this.findOne(workspaceId, id);
    if (proposal.status === ProposalStatus.ACCEPTED) {
      throw new ForbiddenException('Cannot resend an accepted proposal');
    }

    const updated = await this.prisma.proposal.update({
      where: { id },
      data:  { status: ProposalStatus.SENT },
    });

    if (proposal.leadId) {
      await this.prisma.lead.update({
        where: { id: proposal.leadId },
        data:  { stage: LeadStage.PROPOSAL_SENT, lastActivityAt: new Date() },
      });
    }

    this.eventEmitter.emit('proposal.sent', { entityId: id, workspaceId });
    const appUrl = process.env.APP_URL ?? 'http://localhost:5175';
    return {
      proposal: updated,
      shareUrl: `${appUrl}/p/${updated.slug}`,
    };
  }

  async accept(workspaceId: string, id: string) {
    const proposal = await this.findOne(workspaceId, id);
    const updated = await this.prisma.proposal.update({
      where: { id },
      data:  { status: ProposalStatus.ACCEPTED, acceptedAt: new Date() },
    });

    if (proposal.leadId) {
      await this.prisma.lead.update({
        where: { id: proposal.leadId },
        data:  { stage: LeadStage.NEGOTIATING, lastActivityAt: new Date() },
      });
    }

    this.eventEmitter.emit('proposal.accepted', { entityId: id, workspaceId });
    return updated;
  }

  async decline(workspaceId: string, id: string) {
    const proposal = await this.findOne(workspaceId, id);
    if (proposal.status === ProposalStatus.ACCEPTED) {
      throw new ForbiddenException('Cannot decline an already accepted proposal');
    }

    if (proposal.leadId) {
      await this.prisma.lead.update({
        where: { id: proposal.leadId },
        data:  { stage: LeadStage.LOST, lastActivityAt: new Date() },
      });
    }

    return this.prisma.proposal.update({
      where: { id },
      data:  { status: ProposalStatus.DECLINED },
    });
  }

  async recordOpen(slug: string, ipAddress?: string, userAgent?: string) {
    const proposal = await this.prisma.proposal.findUnique({ where: { slug } });
    if (!proposal) throw new NotFoundException('Proposal not found');

    if (proposal.status === ProposalStatus.SENT) {
      await this.prisma.proposal.update({
        where: { id: proposal.id },
        data:  { status: ProposalStatus.OPENED },
      });
    }

    // Fire on every view so the owner is notified each time the client opens it
    if (proposal.status !== ProposalStatus.ACCEPTED && proposal.status !== ProposalStatus.DECLINED) {
      this.eventEmitter.emit('proposal.opened', { entityId: proposal.id, workspaceId: proposal.workspaceId });
    }

    return this.prisma.proposalOpen.create({
      data: { proposalId: proposal.id, ipAddress, userAgent },
    });
  }

  async acceptBySlug(slug: string) {
    const proposal = await this.prisma.proposal.findUnique({ where: { slug } });
    if (!proposal) throw new NotFoundException('Proposal not found');

    // Already accepted — if deposit order exists and is unpaid, return it so the client can still pay
    if (proposal.status === ProposalStatus.ACCEPTED) {
      if (proposal.depositOrderId && !proposal.depositPaid && proposal.depositAmount) {
        const proposalUser = await this.prisma.user.findUnique({
          where: { id: proposal.workspaceId },
          select: { razorpayKeyId: true },
        });
        return {
          proposal,
          depositOrder: {
            orderId:   proposal.depositOrderId,
            amount:    Math.round(Number(proposal.depositAmount) * 100),
            currency:  'INR',
            keyId:     proposalUser?.razorpayKeyId ?? null,
            milestone: 'Deposit',
          },
        };
      }
      return { proposal, depositOrder: null };
    }

    const updated = await this.prisma.proposal.update({
      where: { id: proposal.id },
      data:  { status: ProposalStatus.ACCEPTED, acceptedAt: new Date() },
    });

    if (proposal.leadId) {
      await this.prisma.lead.update({
        where: { id: proposal.leadId },
        data:  { stage: LeadStage.NEGOTIATING, lastActivityAt: new Date() },
      });
    }

    this.eventEmitter.emit('proposal.accepted', { entityId: proposal.id, workspaceId: proposal.workspaceId });

    // If proposal has a payment schedule, create a Razorpay order for the first milestone
    const paymentSchedule = (proposal.content as Record<string, unknown>)
      ?.paymentSchedule as Array<{ milestone: string; amount: number }> | undefined;

    if (paymentSchedule?.length) {
      const deposit = paymentSchedule[0];
      try {
        const proposalUser = await this.prisma.user.findUnique({
          where: { id: proposal.workspaceId },
          select: { razorpayKeyId: true, razorpayKeySecret: true },
        });
        const razorpay = this.makeRazorpay(
          proposalUser?.razorpayKeyId ?? null,
          proposalUser?.razorpayKeySecret ?? null,
        );
        const order = await (razorpay.orders.create as any)({
          amount:   Math.round(deposit.amount * 100),
          currency: 'INR',
          receipt:  proposal.id,
        });
        await this.prisma.proposal.update({
          where: { id: proposal.id },
          data:  { depositOrderId: order.id, depositAmount: deposit.amount },
        });
        return {
          proposal: updated,
          depositOrder: {
            orderId:   order.id,
            amount:    Math.round(deposit.amount * 100),
            currency:  'INR',
            keyId:     proposalUser?.razorpayKeyId ?? null,
            milestone: deposit.milestone,
          },
        };
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        // Razorpay unavailable — still return accepted proposal, no deposit card
      }
    }

    return { proposal: updated, depositOrder: null };
  }

  async verifyDeposit(slug: string, dto: VerifyDepositDto) {
    const proposal = await this.prisma.proposal.findUnique({ where: { slug } });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (!proposal.depositOrderId) throw new BadRequestException('No pending deposit for this proposal');
    if (proposal.depositPaid)     throw new BadRequestException('Deposit already paid');
    if (proposal.depositOrderId !== dto.orderId) throw new BadRequestException('Order ID mismatch');

    const proposalUser = await this.prisma.user.findUnique({
      where: { id: proposal.workspaceId },
      select: { razorpayKeySecret: true },
    });
    if (!proposalUser?.razorpayKeySecret) {
      throw new BadRequestException('Connect your Razorpay account in Settings to enable online payments');
    }
    const expected  = crypto.createHmac('sha256', proposalUser.razorpayKeySecret)
      .update(`${dto.orderId}|${dto.paymentId}`)
      .digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const actualBuf   = Buffer.from(dto.signature, 'utf8');
    if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
      throw new ForbiddenException('Invalid payment signature');
    }

    await this.prisma.proposal.update({
      where: { id: proposal.id },
      data:  { depositPaid: true, depositPaidAt: new Date() },
    });

    // Auto-create a DRAFT invoice for the deposit amount
    if (proposal.depositAmount && proposal.clientId) {
      await this.invoices.create(proposal.workspaceId, {
        clientId:  proposal.clientId,
        lineItems: [{
          description: `Deposit — ${proposal.title}`,
          qty:         1,
          rate:        Number(proposal.depositAmount),
          gstRate:     0,
        }],
        gstType: GstType.EXEMPT,
      } as any);
    }

    this.eventEmitter.emit('proposal.deposit_paid', { entityId: proposal.id, workspaceId: proposal.workspaceId });
    return { success: true };
  }

  async declineBySlug(slug: string) {
    const proposal = await this.prisma.proposal.findUnique({ where: { slug } });
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.status === ProposalStatus.ACCEPTED) {
      throw new ForbiddenException('Cannot decline an already accepted proposal');
    }

    if (proposal.leadId) {
      await this.prisma.lead.update({
        where: { id: proposal.leadId },
        data:  { stage: LeadStage.LOST, lastActivityAt: new Date() },
      });
    }

    const declined = await this.prisma.proposal.update({
      where: { id: proposal.id },
      data:  { status: ProposalStatus.DECLINED },
    });
    this.eventEmitter.emit('proposal.declined', { entityId: proposal.id, workspaceId: proposal.workspaceId });
    return declined;
  }

  async archive(workspaceId: string, id: string) {
    const proposal = await this.findOne(workspaceId, id);
    if (proposal.archivedAt) throw new BadRequestException('Proposal is already archived');
    return this.prisma.proposal.update({ where: { id }, data: { archivedAt: new Date() } });
  }

  async unarchive(workspaceId: string, id: string) {
    const proposal = await this.findOne(workspaceId, id);
    if (!proposal.archivedAt) throw new BadRequestException('Proposal is not archived');
    return this.prisma.proposal.update({ where: { id }, data: { archivedAt: null } });
  }

  async remove(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id);
    const contracts = await this.prisma.contract.count({ where: { proposalId: id } });
    if (contracts > 0) {
      throw new BadRequestException(`Cannot delete: this proposal has ${contracts} contract${contracts > 1 ? 's' : ''}. Archive instead.`);
    }
    return this.prisma.proposal.delete({ where: { id } });
  }
}

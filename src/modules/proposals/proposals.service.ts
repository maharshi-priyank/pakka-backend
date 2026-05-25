import { Injectable, NotFoundException, ForbiddenException, HttpException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';
import { PrismaService } from '../../prisma/prisma.service';
import { GstType, LeadStage, ProposalStatus } from '@prisma/client';
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
  private readonly razorpay: Razorpay;

  constructor(
    private readonly prisma:        PrismaService,
    private readonly eventEmitter:  EventEmitter2,
    private readonly config:        ConfigService,
    private readonly invoices:      InvoicesService,
  ) {
    this.razorpay = new Razorpay({
      key_id:     this.config.get<string>('razorpay.keyId')!,
      key_secret: this.config.get<string>('razorpay.keySecret')!,
    });
  }

  async create(userId: string, dto: CreateProposalDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { plan: true, planExpiresAt: true } });
    const effectivePlan = (user?.planExpiresAt && user.planExpiresAt < new Date()) ? 'FREE' : user?.plan;
    if (effectivePlan === 'FREE') {
      const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
      const count = await this.prisma.proposal.count({ where: { userId, createdAt: { gte: start } } });
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
        userId,
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

  async findAll(userId: string, query: QueryProposalsDto) {
    const { page = 1, limit = 20, status } = query;
    const skip = (page - 1) * limit;

    const where = { userId, ...(status && { status }) };

    const [proposals, total] = await Promise.all([
      this.prisma.proposal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          lead:   { select: { id: true, name: true } },
          client: { select: { id: true, name: true, company: true } },
          opens:  { select: { id: true, openedAt: true } },
          _count: { select: { opens: true } },
        },
      }),
      this.prisma.proposal.count({ where }),
    ]);

    return { items: proposals, total, page, limit };
  }

  async findOne(userId: string, id: string) {
    const proposal = await this.prisma.proposal.findFirst({
      where: { id, userId },
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
      include: { user: { select: { name: true, businessName: true, email: true, logoUrl: true, plan: true } } },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');
    return proposal;
  }

  async update(userId: string, id: string, dto: UpdateProposalDto) {
    const existing = await this.findOne(userId, id);

    const lineItems = dto.content?.lineItems ?? (existing.content as Record<string, unknown>)?.lineItems as LineItemDto[] ?? [];
    const gstType   = dto.content?.gstType ?? (existing.content as Record<string, unknown>)?.gstType as string ?? 'IGST';
    const { subtotal, gstAmount, totalAmount } = calcTotals(lineItems, gstType);

    return this.prisma.proposal.update({
      where: { id },
      data: {
        ...(dto.title      && { title: dto.title }),
        ...(dto.leadId     && { leadId: dto.leadId }),
        ...(dto.clientId   && { clientId: dto.clientId }),
        ...(dto.status     && { status: dto.status }),
        ...(dto.validUntil && { validUntil: new Date(dto.validUntil) }),
        ...(dto.content && {
          content: dto.content as object,
          totalAmount,
          gstAmount,
        }),
      },
      include: { lead: { select: { id: true, name: true } }, client: true, opens: true },
    });
  }

  async send(userId: string, id: string) {
    const proposal = await this.findOne(userId, id);
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

    this.eventEmitter.emit('proposal.sent', { entityId: id, userId });
    const appUrl = process.env.APP_URL ?? 'http://localhost:5175';
    return {
      proposal: updated,
      shareUrl: `${appUrl}/p/${updated.slug}`,
    };
  }

  async accept(userId: string, id: string) {
    const proposal = await this.findOne(userId, id);
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

    this.eventEmitter.emit('proposal.accepted', { entityId: id, userId });
    return updated;
  }

  async decline(userId: string, id: string) {
    const proposal = await this.findOne(userId, id);
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
      this.eventEmitter.emit('proposal.opened', { entityId: proposal.id, userId: proposal.userId });
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
        return {
          proposal,
          depositOrder: {
            orderId:   proposal.depositOrderId,
            amount:    Math.round(Number(proposal.depositAmount) * 100),
            currency:  'INR',
            keyId:     this.config.get<string>('razorpay.keyId'),
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

    this.eventEmitter.emit('proposal.accepted', { entityId: proposal.id, userId: proposal.userId });

    // If proposal has a payment schedule, create a Razorpay order for the first milestone
    const paymentSchedule = (proposal.content as Record<string, unknown>)
      ?.paymentSchedule as Array<{ milestone: string; amount: number }> | undefined;

    if (paymentSchedule?.length) {
      const deposit = paymentSchedule[0];
      try {
        const order = await (this.razorpay.orders.create as any)({
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
            keyId:     this.config.get<string>('razorpay.keyId'),
            milestone: deposit.milestone,
          },
        };
      } catch {
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

    const keySecret = this.config.get<string>('razorpay.keySecret')!;
    const expected  = crypto.createHmac('sha256', keySecret)
      .update(`${dto.orderId}|${dto.paymentId}`)
      .digest('hex');
    if (expected !== dto.signature) throw new ForbiddenException('Invalid payment signature');

    await this.prisma.proposal.update({
      where: { id: proposal.id },
      data:  { depositPaid: true, depositPaidAt: new Date() },
    });

    // Auto-create a DRAFT invoice for the deposit amount
    if (proposal.depositAmount && proposal.clientId) {
      await this.invoices.create(proposal.userId, {
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

    this.eventEmitter.emit('proposal.deposit_paid', { entityId: proposal.id, userId: proposal.userId });
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
    this.eventEmitter.emit('proposal.declined', { entityId: proposal.id, userId: proposal.userId });
    return declined;
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.proposal.delete({ where: { id } });
  }
}

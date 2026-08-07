import { Injectable, NotFoundException, ForbiddenException, HttpException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as crypto from 'crypto';
import Razorpay from 'razorpay';
import { PrismaService } from '../../prisma/prisma.service';
import { GstType, LeadStage, ProposalStatus, Proposal } from '@prisma/client';
import { effectivePlan } from '../users/effective-plan';
import Decimal from 'decimal.js';
import { CreateProposalDto, LineItemDto } from './dto/create-proposal.dto';
import { UpdateProposalDto } from './dto/update-proposal.dto';
import { QueryProposalsDto } from './dto/query-proposals.dto';
import { VerifyDepositDto } from './dto/verify-deposit.dto';
import { SendProposalDto } from './dto/send-proposal.dto';
import { InvoicesService } from '../invoices/invoices.service';
import { resolveDocumentCurrency } from '../shared/resolve-document-currency';

// R7/KTD7: cap brute-force guessing against the 6-digit viewOtp independent of
// the generic global rate limiter (not tuned for a sensitive per-secret check).
const MAX_OTP_ATTEMPTS = 10;

// Generates a short, URL-safe slug like "abc123xy"
function generateSlug(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// Mirrors Contract's generateOtp() shape exactly (src/modules/contracts/contracts.service.ts).
function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
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

    const { currency, isExport } = await resolveDocumentCurrency({
      prisma: this.prisma,
      workspaceId,
      contactId: dto.contactId,
      requestedCurrency: dto.currency,
    });

    // KTD4: mirrors invoices.service.ts:101-106 -- for export proposals, force
    // EXEMPT so calcTotals skips GST entirely. A client-submitted gstType is
    // honored only when the resolved currency is INR. Proposal has no
    // top-level gstType column, so the enforced value is written into the
    // persisted content JSON below, not just used transiently here.
    const lineItems = dto.content?.lineItems ?? [];
    const gstType   = isExport ? 'EXEMPT' : (dto.content?.gstType ?? 'IGST');
    const { gstAmount, totalAmount } = calcTotals(lineItems, gstType);

    const content = {
      ...(dto.content ?? {}),
      gstType,
      // Store client snapshot in content if provided without a clientId
      ...(dto.clientName && !dto.clientId
        ? { clientName: dto.clientName, clientEmail: dto.clientEmail }
        : {}),
    } as object;

    let slug: string;
    // Ensure slug uniqueness
    do { slug = generateSlug(); }
    while (await this.prisma.proposal.findUnique({ where: { slug } }));

    return this.prisma.proposal.create({
      data: {
        workspaceId,
        leadId:      dto.leadId,
        clientId:    dto.clientId,
        contactId:   dto.contactId,
        title:       dto.title,
        slug,
        content,
        currency,
        totalAmount,
        gstAmount,
        validUntil:  dto.validUntil ? new Date(dto.validUntil) : undefined,
      },
      include: { lead: { select: { id: true, name: true } }, client: true, contact: { select: { id: true, name: true } }, opens: true },
    });
  }

  async findAll(workspaceId: string, query: QueryProposalsDto) {
    const { page = 1, limit = 20, status, clientId, contactId, includeArchived } = query;
    const skip = (page - 1) * limit;

    const where = {
      workspaceId,
      ...(includeArchived ? {} : { archivedAt: null }),
      ...(status    && { status }),
      ...(clientId  && { clientId }),
      ...(contactId && { contactId }),
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
          contact: { select: { id: true, name: true, company: true } },
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
        contact:   true,
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
    // R9/R12: otpGated stays visible so the client app knows to show the gate,
    // but viewOtp and the failed-attempt count must never leave the server --
    // otpFailedAttempts would let a caller poll how many guesses remain.
    return { ...proposal, user: userPublic, hideBranding, viewOtp: undefined, otpFailedAttempts: undefined };
  }

  async update(workspaceId: string, id: string, dto: UpdateProposalDto) {
    const existing = await this.findOne(workspaceId, id);

    // KTD4/review-fix: only re-resolve currency/GST when this update could
    // plausibly affect them (contactId, currency, or content changing) --
    // never on a pure metadata edit (title/status/validUntil alone). currency
    // and content.gstType/totals are always recomputed TOGETHER now, never
    // independently -- a request that changes contactId but not content used
    // to leave a stale content.gstType behind a freshly-changed currency
    // column, which could silently flip a document between taxable and
    // export-exempt without the persisted totals ever reflecting it. Gating
    // on "did this request touch something currency-relevant" also means a
    // pure metadata edit on an already-ACCEPTED Proposal never silently
    // re-derives its tax treatment. Never resolved off the Proposal's own
    // persisted `currency` column directly -- every Proposal created before
    // this feature shipped has currency: null, so a naive check against that
    // column would evaluate every one of them as an export.
    const touchesCurrency = dto.contactId !== undefined || dto.currency !== undefined || dto.content !== undefined;

    let currencyUpdate: { currency: string; content: object; totalAmount: Decimal; gstAmount: Decimal } | undefined;
    if (touchesCurrency) {
      const contactId = dto.contactId !== undefined ? dto.contactId : existing.contactId;
      const { currency, isExport } = await resolveDocumentCurrency({
        prisma: this.prisma,
        workspaceId,
        contactId,
        requestedCurrency: dto.currency,
      });

      const existingContent = (existing.content as Record<string, unknown>) ?? {};
      const lineItems = dto.content?.lineItems ?? (existingContent.lineItems as LineItemDto[]) ?? [];
      // A client-submitted gstType (or the previously-persisted one) is honored
      // only when the resolved currency is INR -- otherwise EXEMPT is enforced,
      // overriding whatever the request/stale content would otherwise produce.
      const gstType = isExport
        ? 'EXEMPT'
        : (dto.content?.gstType ?? (existingContent.gstType as string) ?? 'IGST');
      const { gstAmount, totalAmount } = calcTotals(lineItems, gstType);
      currencyUpdate = {
        currency,
        content: { ...existingContent, ...dto.content, gstType } as object,
        totalAmount,
        gstAmount,
      };
    }

    return this.prisma.proposal.update({
      where: { id },
      data: {
        ...(dto.title      && { title: dto.title }),
        ...(dto.leadId     && { leadId: dto.leadId }),
        ...(dto.clientId   !== undefined && { clientId:   dto.clientId  ?? null }),
        ...(dto.contactId  !== undefined && { contactId:  dto.contactId ?? null }),
        ...(dto.projectId  !== undefined && { projectId:  dto.projectId ?? null }),
        ...(dto.status     && { status: dto.status }),
        ...(dto.validUntil && { validUntil: new Date(dto.validUntil) }),
        ...currencyUpdate,
        ...(dto.hidePricingTable !== undefined && { hidePricingTable: dto.hidePricingTable }),
      },
      include: { lead: { select: { id: true, name: true } }, client: true, opens: true },
    });
  }

  async send(workspaceId: string, id: string, dto?: SendProposalDto) {
    const proposal = await this.findOne(workspaceId, id);
    if (proposal.status === ProposalStatus.ACCEPTED) {
      throw new ForbiddenException('Cannot resend an accepted proposal');
    }

    // R7/R8/KTD5: otpGated is only ever set here, in send() — never via the
    // generic update() DTO — so viewOtp is always generated in the same write
    // that turns gating on. A resend also regenerates the OTP and resets the
    // failed-attempt counter (KTD7).
    const otpGated = dto?.otpGated ?? false;
    const viewOtp  = otpGated ? generateOtp() : null;

    const updated = await this.prisma.proposal.update({
      where: { id },
      data:  {
        status: ProposalStatus.SENT,
        sentAt: new Date(),
        otpGated,
        viewOtp,
        otpFailedAttempts: 0,
      },
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
      proposal: { ...updated, viewOtp: undefined },
      shareUrl: `${appUrl}/p/${updated.slug}`,
      otp:      viewOtp,
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

  // R10: creates the ProposalOpen row and flips SENT -> OPENED. Shared by the
  // ungated recordOpen() path and by verifyOtp() on a successful OTP check —
  // gated proposals only reach this via a correct OTP, never on page load.
  private async recordOpenEffects(proposal: Proposal, ipAddress?: string, userAgent?: string) {
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

  async recordOpen(slug: string, ipAddress?: string, userAgent?: string) {
    const proposal = await this.prisma.proposal.findUnique({ where: { slug } });
    if (!proposal) throw new NotFoundException('Proposal not found');

    // R10: gated proposals must go through verifyOtp() instead — recordOpen()
    // is the direct, unauthenticated path this plan closes off for them.
    if (proposal.otpGated) {
      throw new ForbiddenException('This proposal requires OTP verification');
    }

    return this.recordOpenEffects(proposal, ipAddress, userAgent);
  }

  // R12/KTD6: every failure branch below throws this exact same error — no
  // distinguishable status code or message between a missing slug, a
  // not-gated proposal, an exhausted attempt cap, or a wrong OTP. Varying any
  // of them would let an attacker enumerate valid slugs or gated proposals.
  private invalidOtp(): never {
    throw new BadRequestException('Invalid code');
  }

  async verifyOtp(slug: string, otp: string, ipAddress?: string, userAgent?: string) {
    const proposal = await this.prisma.proposal.findUnique({ where: { slug } });
    if (!proposal) return this.invalidOtp();
    if (!proposal.otpGated) return this.invalidOtp();
    if (proposal.otpFailedAttempts >= MAX_OTP_ATTEMPTS) return this.invalidOtp();

    const expectedBuf = proposal.viewOtp ? Buffer.from(proposal.viewOtp, 'utf8') : null;
    const actualBuf    = Buffer.from(otp, 'utf8');
    const matches = !!expectedBuf
      && expectedBuf.length === actualBuf.length
      && crypto.timingSafeEqual(expectedBuf, actualBuf);

    if (!matches) {
      // Atomic increment -- a read-then-write here would let concurrent wrong
      // guesses race past MAX_OTP_ATTEMPTS, since each request would read the
      // same stale count and write the same +1 result.
      await this.prisma.proposal.update({
        where: { id: proposal.id },
        data:  { otpFailedAttempts: { increment: 1 } },
      });
      return this.invalidOtp();
    }

    // Correct OTP is not one-shot (unlike Contract's sign()) — a client may
    // revisit a Proposal multiple times, so viewOtp is left intact here.
    return this.recordOpenEffects(proposal, ipAddress, userAgent);
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

    // review-fix: this integration's Razorpay orders are hardcoded to
    // currency: 'INR' below (deliberately out of scope for this feature --
    // see the plan's Scope Boundaries). Now that Proposal.currency is real,
    // creating an order for a non-INR Proposal would charge the deposit
    // amount as if it were INR paise -- e.g. a $500 Proposal would create a
    // ₹500 order, wrong currency AND wrong amount by the exchange rate. Skip
    // the auto-deposit order rather than silently mischarge; the Proposal is
    // still accepted, the freelancer just collects that deposit manually.
    if (paymentSchedule?.length && (proposal.currency ?? 'INR') === 'INR') {
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

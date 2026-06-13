import {
  Injectable, NotFoundException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ContractStatus } from '@prisma/client';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { QueryContractsDto } from './dto/query-contracts.dto';
import { SignContractDto } from './dto/sign-contract.dto';
import { effectivePlan } from '../users/effective-plan';

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

const INCLUDE_FULL = {
  proposal: { select: { id: true, title: true, slug: true } },
  client:   true,
} as const;

const INCLUDE_LIST = {
  client:  { select: { id: true, name: true, company: true } },
  project: { select: { id: true, name: true } },
} as const;

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma:       PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(userId: string, dto: CreateContractDto) {
    return this.prisma.contract.create({
      data: {
        userId,
        proposalId: dto.proposalId,
        clientId:   dto.clientId,
        title:      dto.title,
        content:    (dto.content ?? {}) as object,
      },
      include: INCLUDE_FULL,
    });
  }

  async createFromProposal(userId: string, proposalId: string) {
    const proposal = await this.prisma.proposal.findFirst({
      where:   { id: proposalId, userId },
      include: { lead: true },
    });
    if (!proposal) throw new NotFoundException('Proposal not found');

    const existing = await this.prisma.contract.findFirst({ where: { proposalId } });
    if (existing) return existing;

    // Resolve clientId: use existing client, or auto-convert lead → client
    let clientId = proposal.clientId
    if (!clientId && proposal.lead) {
      const lead = proposal.lead
      if (lead.clientId) {
        clientId = lead.clientId
      } else {
        const newClient = await this.prisma.client.create({
          data: {
            userId,
            name:    lead.name,
            email:   lead.email    ?? undefined,
            phone:   lead.phone    ?? undefined,
            company: lead.company  ?? undefined,
          },
        })
        clientId = newClient.id
        // Link lead and proposal to the new client
        await Promise.all([
          this.prisma.lead.update({ where: { id: lead.id }, data: { clientId } }),
          this.prisma.proposal.update({ where: { id: proposalId }, data: { clientId } }),
        ])
      }
    }

    const c = proposal.content as Record<string, unknown>;

    const content = {
      intro:              `This agreement is entered into between the service provider and the client for the project described below.`,
      projectDescription: `Project: ${proposal.title}`,
      totalAmount:        Number(proposal.totalAmount),
      gstAmount:          Number(proposal.gstAmount),
      gstType:            c.gstType ?? 'IGST',
      tdsRate:            (c.tdsRate as number | undefined) ?? null,
      scopeItems:         c.scopeItems   ?? [],
      deliverables:       c.deliverables ?? [],
      exclusions:         c.exclusions   ?? [],
      paymentSchedule:    c.paymentSchedule ?? [],
      clauses: [
        {
          title: 'Payment Terms',
          body:  (c.pricingNotes as string | undefined) ?? '50% advance before work begins. Remaining 50% due on final delivery.',
        },
        {
          title: 'Terms & Conditions',
          body:  (c.terms as string | undefined) ?? 'Standard terms apply.',
        },
      ],
    };

    return this.prisma.contract.create({
      data: {
        userId,
        proposalId: proposal.id,
        clientId,
        title:      `Contract — ${proposal.title}`,
        content:    content as object,
      },
      include: INCLUDE_FULL,
    });
  }

  async findAll(userId: string, query: QueryContractsDto) {
    const { page = 1, limit = 20, status, clientId } = query;
    const skip  = (page - 1) * limit;
    const where = { userId, ...(status && { status }), ...(clientId && { clientId }) };

    const [contracts, total] = await Promise.all([
      this.prisma.contract.findMany({
        where,
        skip,
        take:    limit,
        orderBy: { createdAt: 'desc' },
        include: INCLUDE_LIST,
      }),
      this.prisma.contract.count({ where }),
    ]);

    return { items: contracts, total, page, limit };
  }

  async findOne(userId: string, id: string) {
    const contract = await this.prisma.contract.findFirst({
      where:   { id, userId },
      include: INCLUDE_FULL,
    });
    if (!contract) throw new NotFoundException('Contract not found');
    return contract;
  }

  async findByIdPublic(id: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        user:   { select: { name: true, businessName: true, email: true, logoUrl: true, plan: true, planExpiresAt: true, subscriptionStatus: true } },
        client: { select: { id: true, name: true, company: true, email: true } },
      },
    });
    if (!contract) throw new NotFoundException('Contract not found');
    const hideBranding = effectivePlan(contract.user) === 'STUDIO';
    const { planExpiresAt: _pe, subscriptionStatus: _ss, ...userPublic } = contract.user;
    return { ...contract, user: userPublic, hideBranding, signerOtp: undefined };
  }

  async update(userId: string, id: string, dto: UpdateContractDto) {
    await this.findOne(userId, id);
    return this.prisma.contract.update({
      where: { id },
      data: {
        ...(dto.title   && { title:   dto.title }),
        ...(dto.status  && { status:  dto.status }),
        ...(dto.clientId  && { clientId:  dto.clientId }),
        ...(dto.projectId !== undefined && { projectId: dto.projectId ?? null }),
        ...(dto.content   && { content: dto.content as object }),
      },
      include: INCLUDE_FULL,
    });
  }

  async send(userId: string, id: string) {
    const contract = await this.findOne(userId, id);
    if (contract.status === ContractStatus.SIGNED) {
      throw new ForbiddenException('Contract is already signed');
    }

    const otp = generateOtp();

    const updated = await this.prisma.contract.update({
      where: { id },
      data:  { status: ContractStatus.SENT, signerOtp: otp, sentAt: new Date() },
    });

    this.eventEmitter.emit('contract.sent', { entityId: id, userId });
    const appUrl = process.env.APP_URL ?? 'http://localhost:5175';
    return {
      contract: { ...updated, signerOtp: undefined },
      signUrl:  `${appUrl}/sign/${updated.id}`,
      otp,
    };
  }

  async sign(id: string, dto: SignContractDto, ipAddress?: string, userAgent?: string) {
    const contract = await this.prisma.contract.findUnique({ where: { id } });
    if (!contract) throw new NotFoundException('Contract not found');
    if (contract.status === ContractStatus.SIGNED) {
      throw new ForbiddenException('Contract is already signed');
    }
    if (contract.status !== ContractStatus.SENT) {
      throw new ForbiddenException('Contract has not been sent for signing');
    }
    if (!contract.signerOtp || contract.signerOtp !== dto.otp) {
      throw new BadRequestException('Invalid OTP');
    }

    const auditLog = {
      signedAt:   new Date().toISOString(),
      ipAddress,
      userAgent,
      otpVerified: true,
    };

    const signed = await this.prisma.contract.update({
      where: { id },
      data: {
        status:    ContractStatus.SIGNED,
        signedAt:  new Date(),
        signerOtp: null,
        auditLog:  auditLog as object,
      },
    });

    this.eventEmitter.emit('contract.signed', { entityId: id, userId: contract.userId });
    return { ...signed, signerOtp: undefined };
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    return this.prisma.contract.delete({ where: { id } });
  }
}

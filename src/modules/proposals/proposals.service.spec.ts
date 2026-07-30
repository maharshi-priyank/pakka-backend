import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ProposalsService } from './proposals.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';

// R7/R8/R10/R12: send() opts a Proposal into OTP-gating and generates its
// viewOtp in the same write; findBySlug() never leaks viewOtp; verifyOtp()
// gates recordOpen()'s side effects behind a correct OTP with zero
// information leakage between failure branches (KTD6).
describe('ProposalsService', () => {
  let service: ProposalsService;
  let prisma: {
    proposal: {
      findFirst:   jest.Mock;
      findUnique:  jest.Mock;
      update:      jest.Mock;
    };
    lead: {
      update: jest.Mock;
    };
    proposalOpen: {
      create: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
  };
  let emitter: { emit: jest.Mock };

  const owner = {
    email:              'owner@example.com',
    plan:                'FREE',
    planExpiresAt:       null,
    subscriptionStatus:  'CANCELLED',
  };

  const baseProposal = {
    id:                'prop-1',
    workspaceId:        'ws-1',
    slug:               'abc123xy99',
    leadId:             null,
    status:             'SENT',
    otpGated:           false,
    viewOtp:            null as string | null,
    otpFailedAttempts:  0,
  };

  beforeEach(async () => {
    prisma = {
      proposal: {
        findFirst:  jest.fn(),
        findUnique: jest.fn(),
        update:     jest.fn(),
      },
      lead: {
        update: jest.fn(),
      },
      proposalOpen: {
        create: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };
    emitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProposalsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: emitter },
        { provide: InvoicesService, useValue: {} },
      ],
    }).compile();

    service = module.get<ProposalsService>(ProposalsService);
  });

  // Prisma's `update` on the model normally returns the post-update row —
  // simulate that by merging the patch onto the base row.
  function mockUpdateMerges() {
    prisma.proposal.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ ...baseProposal, ...data }));
  }

  describe('send()', () => {
    it('generates and returns a 6-digit viewOtp in the same write when otpGated is true', async () => {
      prisma.proposal.findFirst.mockResolvedValue({ ...baseProposal, status: 'DRAFT' });
      mockUpdateMerges();

      const result = await service.send('ws-1', 'prop-1', { otpGated: true });

      expect(prisma.proposal.update).toHaveBeenCalledWith({
        where: { id: 'prop-1' },
        data:  expect.objectContaining({
          status:            'SENT',
          otpGated:          true,
          viewOtp:           expect.stringMatching(/^\d{6}$/),
          otpFailedAttempts: 0,
        }),
      });
      expect(result.otp).toMatch(/^\d{6}$/);
      expect(result.proposal.viewOtp).toBeUndefined();
    });

    it('behaves exactly as today when otpGated is false/omitted — no viewOtp generated', async () => {
      prisma.proposal.findFirst.mockResolvedValue({ ...baseProposal, status: 'DRAFT' });
      mockUpdateMerges();

      const result = await service.send('ws-1', 'prop-1');

      expect(prisma.proposal.update).toHaveBeenCalledWith({
        where: { id: 'prop-1' },
        data:  { status: 'SENT', otpGated: false, viewOtp: null, otpFailedAttempts: 0 },
      });
      expect(result.otp).toBeNull();
      expect(result.proposal.viewOtp).toBeUndefined();
    });
  });

  describe('findBySlug()', () => {
    it('never includes viewOtp in its response', async () => {
      prisma.proposal.findUnique.mockResolvedValue({
        ...baseProposal,
        otpGated: true,
        viewOtp:  '123456',
        otpFailedAttempts: 3,
        workspace: { name: 'Acme', businessName: null, logoUrl: null },
        attachments: [],
      });
      prisma.user.findUnique.mockResolvedValue(owner);

      const result = await service.findBySlug('abc123xy99');

      expect(result.viewOtp).toBeUndefined();
      expect(result.otpFailedAttempts).toBeUndefined();
      expect(result.otpGated).toBe(true);
    });
  });

  describe('recordOpen()', () => {
    it('rejects a gated proposal instead of recording the open', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ ...baseProposal, otpGated: true });

      await expect(service.recordOpen('abc123xy99')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.proposalOpen.create).not.toHaveBeenCalled();
      expect(prisma.proposal.update).not.toHaveBeenCalled();
    });

    it('records the open unchanged for a non-gated proposal', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ ...baseProposal, otpGated: false, status: 'SENT' });
      mockUpdateMerges();
      prisma.proposalOpen.create.mockResolvedValue({ id: 'open-1' });

      await service.recordOpen('abc123xy99', '1.2.3.4', 'ua');

      expect(prisma.proposal.update).toHaveBeenCalledWith({
        where: { id: 'prop-1' },
        data:  { status: 'OPENED' },
      });
      expect(prisma.proposalOpen.create).toHaveBeenCalledWith({
        data: { proposalId: 'prop-1', ipAddress: '1.2.3.4', userAgent: 'ua' },
      });
    });
  });

  describe('verifyOtp()', () => {
    const gated = { ...baseProposal, otpGated: true, viewOtp: '654321', status: 'SENT' };

    it('creates a ProposalOpen record and transitions SENT -> OPENED on a correct OTP', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ ...gated });
      mockUpdateMerges();
      prisma.proposalOpen.create.mockResolvedValue({ id: 'open-1' });

      await service.verifyOtp('abc123xy99', '654321', '1.2.3.4', 'ua');

      expect(prisma.proposal.update).toHaveBeenCalledWith({
        where: { id: 'prop-1' },
        data:  { status: 'OPENED' },
      });
      expect(prisma.proposalOpen.create).toHaveBeenCalledWith({
        data: { proposalId: 'prop-1', ipAddress: '1.2.3.4', userAgent: 'ua' },
      });
    });

    it('succeeds again on a second call with the same correct OTP (not one-shot)', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ ...gated, status: 'OPENED' });
      mockUpdateMerges();
      prisma.proposalOpen.create.mockResolvedValue({ id: 'open-2' });

      await expect(service.verifyOtp('abc123xy99', '654321')).resolves.toEqual({ id: 'open-2' });
      // Status is already OPENED, so no further status update — but the open
      // record is still created, proving the OTP isn't invalidated on first use.
      expect(prisma.proposal.update).not.toHaveBeenCalled();
      expect(prisma.proposalOpen.create).toHaveBeenCalledTimes(1);
    });

    async function expectGenericFailure(promise: Promise<unknown>) {
      await expect(promise).rejects.toBeInstanceOf(BadRequestException);
      await expect(promise.catch((e) => e)).resolves.toMatchObject({ message: 'Invalid code' });
      expect(prisma.proposalOpen.create).not.toHaveBeenCalled();
    }

    it('rejects an incorrect OTP with the generic error, without side effects', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ ...gated });
      mockUpdateMerges();

      await expectGenericFailure(service.verifyOtp('abc123xy99', '000000'));
      expect(prisma.proposal.update).toHaveBeenCalledWith({
        where: { id: 'prop-1' },
        data:  { otpFailedAttempts: { increment: 1 } },
      });
    });

    it('rejects a non-gated proposal with the same generic error', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ ...baseProposal, otpGated: false });

      await expectGenericFailure(service.verifyOtp('abc123xy99', '654321'));
    });

    it('rejects a nonexistent slug with the same generic error', async () => {
      prisma.proposal.findUnique.mockResolvedValue(null);

      await expectGenericFailure(service.verifyOtp('does-not-exist', '654321'));
    });

    it('guards against a null viewOtp instead of crashing on timingSafeEqual', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ ...gated, viewOtp: null });
      mockUpdateMerges();

      await expectGenericFailure(service.verifyOtp('abc123xy99', '654321'));
    });

    it('locks out further submissions after MAX_ATTEMPTS failures, even with the correct OTP, until resend', async () => {
      prisma.proposal.findUnique.mockResolvedValue({ ...gated, otpFailedAttempts: 10 });
      mockUpdateMerges();

      await expectGenericFailure(service.verifyOtp('abc123xy99', '654321'));
      // No further attempt increment past the cap — verifyOtp() short-circuits
      // before ever comparing the submitted OTP.
      expect(prisma.proposal.update).not.toHaveBeenCalled();
    });
  });
});

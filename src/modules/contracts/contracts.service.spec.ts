import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContractsService } from './contracts.service';
import { PrismaService } from '../../prisma/prisma.service';

// U6/KTD1/KTD4/KTD6: create()/update() resolve currency via the shared
// resolveDocumentCurrency() helper and enforce EXEMPT gstType for non-INR
// resolutions -- never off the Contract's own (possibly null) persisted
// currency column. createFromProposal() carries the source Proposal's
// currency forward as a plain nullish-coalesce, never a fresh lookup.
//
// Scoped to this plan's currency/GST behavior only -- not a retroactive
// full-service test suite (no existing spec file for ContractsService today).
describe('ContractsService', () => {
  let service: ContractsService;
  let prisma: {
    contract: {
      create:    jest.Mock;
      update:    jest.Mock;
      findFirst: jest.Mock;
    };
    proposal: {
      findFirst: jest.Mock;
      update:    jest.Mock;
    };
    contact: {
      findUnique: jest.Mock;
    };
    workspace: {
      findUnique: jest.Mock;
    };
    lead: {
      update: jest.Mock;
    };
    client: {
      create: jest.Mock;
    };
  };
  let emitter: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = {
      contract: {
        create:    jest.fn(),
        update:    jest.fn(),
        findFirst: jest.fn(),
      },
      proposal: {
        findFirst: jest.fn(),
        update:    jest.fn(),
      },
      contact: {
        findUnique: jest.fn(),
      },
      workspace: {
        findUnique: jest.fn(),
      },
      lead: {
        update: jest.fn(),
      },
      client: {
        create: jest.fn(),
      },
    };
    emitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: emitter },
      ],
    }).compile();

    service = module.get<ContractsService>(ContractsService);
  });

  describe('create()', () => {
    beforeEach(() => {
      prisma.contract.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(data));
    });

    it('resolves currency from a linked non-INR Contact and forces content.gstType to EXEMPT', async () => {
      prisma.contact.findUnique.mockResolvedValue({ currency: 'GBP' });

      const result: any = await service.create('ws-1', {
        title: 'Test contract', contactId: 'contact-1', content: {},
      } as any);

      expect(prisma.contact.findUnique).toHaveBeenCalledWith({
        where:  { id: 'contact-1', workspaceId: 'ws-1' },
        select: { currency: true },
      });
      expect(result.currency).toBe('GBP');
      expect(result.content.gstType).toBe('EXEMPT');
    });

    it('leaves gstType following dto.content.gstType (defaulting to IGST) for an INR-linked Contact', async () => {
      prisma.contact.findUnique.mockResolvedValue({ currency: 'INR' });

      const result: any = await service.create('ws-1', {
        title: 'Test contract', contactId: 'contact-2', content: {},
      } as any);

      expect(result.currency).toBe('INR');
      expect(result.content.gstType).toBe('IGST');
    });

    it('falls through to the Workspace currency when no contactId is given (R8)', async () => {
      prisma.workspace.findUnique.mockResolvedValue({ currency: 'INR' });

      const result: any = await service.create('ws-1', {
        title: 'Test contract', content: {},
      } as any);

      expect(prisma.contact.findUnique).not.toHaveBeenCalled();
      expect(prisma.workspace.findUnique).toHaveBeenCalledWith({
        where:  { id: 'ws-1' },
        select: { currency: true },
      });
      expect(result.currency).toBe('INR');
      expect(result.content.gstType).toBe('IGST');
    });
  });

  describe('update()', () => {
    const existingContract = {
      id:          'contract-1',
      workspaceId: 'ws-1',
      contactId:   'contact-1',
      content:     { gstType: 'IGST' },
      currency:    null as string | null,
    };

    beforeEach(() => {
      prisma.contract.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...existingContract, ...data }));
    });

    it('merges the freshly-derived EXEMPT gstType into content for a non-INR linked Contact', async () => {
      prisma.contract.findFirst.mockResolvedValue(existingContract);
      prisma.contact.findUnique.mockResolvedValue({ currency: 'USD' });

      await service.update('ws-1', 'contract-1', {
        content: { totalAmount: 1000 },
      } as any);

      expect(prisma.contact.findUnique).toHaveBeenCalledWith({
        where:  { id: 'contact-1', workspaceId: 'ws-1' },
        select: { currency: true },
      });
      expect(prisma.contract.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'contract-1' },
        data:  expect.objectContaining({
          currency: 'USD',
          content:  expect.objectContaining({ gstType: 'EXEMPT', totalAmount: 1000 }),
        }),
      }));
    });

    // KTD4: every pre-existing Contract has currency: null -- update() must
    // re-resolve via the helper (using the linked Contact) rather than ever
    // reading that null column directly, or every legacy INR Contract would
    // wrongly flip to EXEMPT on its next edit.
    it('does not flip gstType to EXEMPT for a pre-existing null-currency Contract linked to an INR Contact', async () => {
      prisma.contract.findFirst.mockResolvedValue(existingContract);
      prisma.contact.findUnique.mockResolvedValue({ currency: 'INR' });

      await service.update('ws-1', 'contract-1', {
        content: { totalAmount: 1000 },
      } as any);

      expect(prisma.contract.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          currency: 'INR',
          content:  expect.objectContaining({ gstType: 'IGST' }),
        }),
      }));
    });

    it('does not touch content when dto.content is absent, but still resolves and persists currency', async () => {
      prisma.contract.findFirst.mockResolvedValue(existingContract);
      prisma.contact.findUnique.mockResolvedValue({ currency: 'USD' });

      await service.update('ws-1', 'contract-1', { title: 'New title' } as any);

      expect(prisma.contract.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { title: 'New title', currency: 'USD' },
      }));
    });

    // A currency-only change (no content edit) must still persist -- mirrors
    // Proposal's update(), which always resolves currency regardless of
    // whether dto.content is present.
    it('persists a currency-only update with no dto.content', async () => {
      prisma.contract.findFirst.mockResolvedValue(existingContract);

      await service.update('ws-1', 'contract-1', { currency: 'GBP' } as any);

      expect(prisma.contact.findUnique).not.toHaveBeenCalled();
      expect(prisma.contract.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { currency: 'GBP' },
      }));
    });
  });

  describe('createFromProposal()', () => {
    function mockProposal(overrides: Record<string, unknown>) {
      prisma.proposal.findFirst.mockResolvedValue({
        id:         'prop-1',
        title:      'Website project',
        clientId:   'client-1',
        contactId:  'contact-1',
        content:    {},
        totalAmount: 100,
        gstAmount:   0,
        lead:        null,
        ...overrides,
      });
      prisma.contract.findFirst.mockResolvedValue(null); // no existing Contract for this Proposal
      prisma.contract.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(data));
    }

    it('carries the source Proposal currency forward as-is, without a fresh Contact lookup (KTD6)', async () => {
      mockProposal({ currency: 'EUR' });

      const result: any = await service.createFromProposal('ws-1', 'prop-1');

      expect(prisma.contact.findUnique).not.toHaveBeenCalled();
      expect(result.currency).toBe('EUR');
    });

    it('floors to INR for a pre-U5 Proposal with currency: null, without a fresh lookup', async () => {
      mockProposal({ currency: null });

      const result: any = await service.createFromProposal('ws-1', 'prop-1');

      expect(prisma.contact.findUnique).not.toHaveBeenCalled();
      expect(prisma.workspace.findUnique).not.toHaveBeenCalled();
      expect(result.currency).toBe('INR');
    });
  });
});

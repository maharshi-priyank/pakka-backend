import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContractsService } from './contracts.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ContractTemplatesService } from '../contract-templates/contract-templates.service';

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
  let contractTemplates: { getDefault: jest.Mock };

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

    // U5/KTD3: defaults to null (no seeded template yet) so every
    // pre-existing test in this file -- none of which mock the Contract
    // template table -- keeps exercising the original hardcoded-fallback
    // path unchanged. Tests that need a default template override this
    // per-test via contractTemplates.getDefault.mockResolvedValue(...).
    contractTemplates = { getDefault: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: emitter },
        { provide: ContractTemplatesService, useValue: contractTemplates },
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

    // review-fix: a pure metadata edit (title/status alone) touches neither
    // contactId, currency, nor content, so currency/GST are never re-resolved
    // -- this is what keeps an unrelated edit from silently re-deriving tax
    // treatment on an already-finalized Contract.
    it('does not resolve or touch currency/content for a pure metadata edit', async () => {
      prisma.contract.findFirst.mockResolvedValue(existingContract);

      await service.update('ws-1', 'contract-1', { title: 'New title' } as any);

      expect(prisma.contact.findUnique).not.toHaveBeenCalled();
      expect(prisma.contract.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { title: 'New title' },
      }));
    });

    // review-fix: a currency-only change (no content edit) must still sync
    // content.gstType together with currency -- previously currency was
    // persisted unconditionally while content.gstType was only synced when
    // dto.content was present, so a currency-only change could leave a
    // stale, inconsistent content.gstType behind a freshly-changed currency.
    it('persists a currency-only update and keeps content.gstType in sync with it', async () => {
      prisma.contract.findFirst.mockResolvedValue(existingContract);

      await service.update('ws-1', 'contract-1', { currency: 'GBP' } as any);

      expect(prisma.contact.findUnique).not.toHaveBeenCalled();
      expect(prisma.contract.update).toHaveBeenCalledWith(expect.objectContaining({
        data: {
          currency: 'GBP',
          content:  expect.objectContaining({ gstType: 'EXEMPT' }),
        },
      }));
    });

    // review-fix: a contactId reassignment must resolve currency against the
    // NEW contact in the same request, not the contact being replaced --
    // previously resolveDocumentCurrency() was always called with
    // existing.contactId, so relinking a Contract to a different Contact
    // left the OLD contact's currency/GST treatment on a row now pointing at
    // the NEW contact.
    it('resolves currency against the new contactId when reassigning a Contract to a different Contact', async () => {
      prisma.contract.findFirst.mockResolvedValue(existingContract);
      prisma.contact.findUnique.mockResolvedValue({ currency: 'USD' });

      await service.update('ws-1', 'contract-1', { contactId: 'contact-2' } as any);

      expect(prisma.contact.findUnique).toHaveBeenCalledWith({
        where:  { id: 'contact-2', workspaceId: 'ws-1' },
        select: { currency: true },
      });
      expect(prisma.contract.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          contactId: 'contact-2',
          currency:  'USD',
          content:   expect.objectContaining({ gstType: 'EXEMPT' }),
        }),
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

    // U5/KTD5: default-template clause merge. Matched by array position
    // (clauses[0] -> Payment Terms, clauses[1] -> Terms & Conditions), never
    // a title-string lookup.
    describe('default Contract template clause merge (U5/KTD5)', () => {
      function mockDefaultTemplate(clauses: Array<{ title: string; body: string }>) {
        contractTemplates.getDefault.mockResolvedValue({
          id: 'tmpl-1', workspaceId: 'ws-1', isSystem: true, isDefault: true,
          content: { clauses },
        });
      }

      it('uses the default template clause text when the Proposal has no pricingNotes/terms', async () => {
        mockProposal({ currency: 'INR' });
        mockDefaultTemplate([
          { title: 'Payment Terms', body: 'Template: 30% upfront, 70% on delivery.' },
          { title: 'Terms & Conditions', body: 'Template: governed by the laws of India.' },
        ]);

        const result: any = await service.createFromProposal('ws-1', 'prop-1');

        expect(contractTemplates.getDefault).toHaveBeenCalledWith('ws-1');
        expect(result.content.clauses[0].body).toBe('Template: 30% upfront, 70% on delivery.');
        expect(result.content.clauses[1].body).toBe('Template: governed by the laws of India.');
      });

      it('still lets explicit Proposal pricingNotes/terms win over the default template', async () => {
        mockProposal({
          currency: 'INR',
          content: { pricingNotes: 'Proposal: 100% upfront.', terms: 'Proposal: NDA applies.' },
        });
        mockDefaultTemplate([
          { title: 'Payment Terms', body: 'Template: 30% upfront, 70% on delivery.' },
          { title: 'Terms & Conditions', body: 'Template: governed by the laws of India.' },
        ]);

        const result: any = await service.createFromProposal('ws-1', 'prop-1');

        expect(result.content.clauses[0].body).toBe('Proposal: 100% upfront.');
        expect(result.content.clauses[1].body).toBe('Proposal: NDA applies.');
      });

      it('falls back to the pre-existing hardcoded strings when getDefault() returns null', async () => {
        mockProposal({ currency: 'INR' });
        contractTemplates.getDefault.mockResolvedValue(null);

        const result: any = await service.createFromProposal('ws-1', 'prop-1');

        expect(result.content.clauses[0].body).toBe('50% advance before work begins. Remaining 50% due on final delivery.');
        expect(result.content.clauses[1].body).toBe('Standard terms apply.');
      });

      it('falls back per-slot when the default template has fewer than 2 clause entries', async () => {
        mockProposal({ currency: 'INR' });
        mockDefaultTemplate([{ title: 'Payment Terms', body: 'Template: 30% upfront, 70% on delivery.' }]);

        const result: any = await service.createFromProposal('ws-1', 'prop-1');

        expect(result.content.clauses[0].body).toBe('Template: 30% upfront, 70% on delivery.');
        expect(result.content.clauses[1].body).toBe('Standard terms apply.');
      });

      it('leaves scopeItems/deliverables/exclusions/paymentSchedule/totalAmount/gstAmount unaffected by which template is default (R7)', async () => {
        mockProposal({
          currency:        'INR',
          totalAmount:     5000,
          gstAmount:       900,
          content: {
            scopeItems:      ['Design', 'Build'],
            deliverables:    ['Figma file', 'Deployed app'],
            exclusions:      ['Hosting costs'],
            paymentSchedule: [{ milestone: 'Kickoff', percent: 50 }],
          },
        });
        mockDefaultTemplate([
          { title: 'Payment Terms', body: 'Template: 30% upfront, 70% on delivery.' },
          { title: 'Terms & Conditions', body: 'Template: governed by the laws of India.' },
        ]);

        const result: any = await service.createFromProposal('ws-1', 'prop-1');

        expect(result.content.scopeItems).toEqual(['Design', 'Build']);
        expect(result.content.deliverables).toEqual(['Figma file', 'Deployed app']);
        expect(result.content.exclusions).toEqual(['Hosting costs']);
        expect(result.content.paymentSchedule).toEqual([{ milestone: 'Kickoff', percent: 50 }]);
        expect(result.content.totalAmount).toBe(5000);
        expect(result.content.gstAmount).toBe(900);
      });

      // AE1: default template's clause wording + Proposal's real
      // scope/schedule/amount both correctly land on the same generated
      // Contract in one pass.
      it('combines default-template clause wording with the Proposal real scope/schedule/amount on one generated Contract (AE1)', async () => {
        mockProposal({
          currency:        'USD',
          totalAmount:     12000,
          gstAmount:       0,
          content: {
            scopeItems:      ['Discovery', 'Implementation'],
            deliverables:    ['Source code'],
            exclusions:      ['Third-party licenses'],
            paymentSchedule: [
              { milestone: 'Signing', percent: 40 },
              { milestone: 'Completion', percent: 60 },
            ],
          },
        });
        mockDefaultTemplate([
          { title: 'Payment Terms', body: 'Template: 40/60 split.' },
          { title: 'Terms & Conditions', body: 'Template: standard SaaS terms.' },
        ]);

        const result: any = await service.createFromProposal('ws-1', 'prop-1');

        expect(result.content.clauses[0].body).toBe('Template: 40/60 split.');
        expect(result.content.clauses[1].body).toBe('Template: standard SaaS terms.');
        expect(result.content.scopeItems).toEqual(['Discovery', 'Implementation']);
        expect(result.content.deliverables).toEqual(['Source code']);
        expect(result.content.exclusions).toEqual(['Third-party licenses']);
        expect(result.content.paymentSchedule).toEqual([
          { milestone: 'Signing', percent: 40 },
          { milestone: 'Completion', percent: 60 },
        ]);
        expect(result.content.totalAmount).toBe(12000);
        expect(result.currency).toBe('USD');
      });
    });
  });
});

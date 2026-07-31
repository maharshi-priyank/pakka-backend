import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoiceTemplatesService } from '../invoice-templates/invoice-templates.service';

// R13/R14: findByIdPublic() flips SENT/OVERDUE -> VIEWED via an atomic conditional
// updateMany, and leaves every other status untouched.
// U7/KTD1/KTD6: create() resolves currency via the shared resolveDocumentCurrency()
// helper (unchanged behavior for callers that already send dto.currency, newly
// correct for a contactId-linked Invoice created without one); createFromContract()
// carries the source Contract's own currency forward with a plain '?? INR' floor,
// never a fresh Contact/Workspace lookup.
describe('InvoicesService', () => {
  let service: InvoicesService;
  let prisma: {
    invoice: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      findFirst:  jest.Mock;
      findMany:   jest.Mock;
      create:     jest.Mock;
      update:     jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
    contact: {
      findUnique: jest.Mock;
    };
    workspace: {
      findUnique: jest.Mock;
    };
    contract: {
      findFirst: jest.Mock;
    };
  };
  let invoiceTemplates: { getDefault: jest.Mock; findOne: jest.Mock };

  const owner = {
    email:              'owner@example.com',
    plan:                'FREE',
    planExpiresAt:       null,
    subscriptionStatus:  'CANCELLED',
  };

  const baseInvoice = {
    id:          'inv-1',
    workspaceId: 'ws-1',
    status:      'SENT',
    workspace:   { name: 'Acme', businessName: null, logoUrl: null, gstNumber: null, bankName: null, bankAccountName: null, bankAccountNumber: null, bankIfsc: null, upiId: null, upiQrUrl: null, country: null, taxLabel: null, ibanNumber: null, swiftCode: null, routingNumber: null },
    client:      { id: 'client-1', name: 'Client' },
  };

  beforeEach(async () => {
    prisma = {
      invoice: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
        findFirst:  jest.fn(),
        findMany:   jest.fn(),
        create:     jest.fn(),
        update:     jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      contact: {
        findUnique: jest.fn(),
      },
      workspace: {
        findUnique: jest.fn(),
      },
      contract: {
        findFirst: jest.fn(),
      },
    };

    // U6: getDefault() defaults to null (pre-seed / no-template state) unless a
    // test overrides it — matches InvoiceTemplatesService.getDefault()'s own
    // belt-and-suspenders null return for a workspace with no default yet.
    // U8: findOne() has no default resolved value — each reapplyTemplate() test
    // sets it explicitly (either a workspace-scoped template or a rejection).
    invoiceTemplates = { getDefault: jest.fn().mockResolvedValue(null), findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: InvoiceTemplatesService, useValue: invoiceTemplates },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
  });

  function mockInvoice(status: string) {
    prisma.invoice.findUnique.mockResolvedValue({ ...baseInvoice, status });
    prisma.user.findUnique.mockResolvedValue(owner);
  }

  it('transitions a SENT invoice to VIEWED on public view', async () => {
    mockInvoice('SENT');
    prisma.invoice.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.findByIdPublic('inv-1');

    expect(prisma.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv-1', status: { in: ['SENT', 'OVERDUE'] } },
      data:  { status: 'VIEWED' },
    });
    expect(result.status).toBe('VIEWED');
  });

  it('transitions an OVERDUE invoice to VIEWED on public view', async () => {
    mockInvoice('OVERDUE');
    prisma.invoice.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.findByIdPublic('inv-1');

    expect(prisma.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv-1', status: { in: ['SENT', 'OVERDUE'] } },
      data:  { status: 'VIEWED' },
    });
    expect(result.status).toBe('VIEWED');
  });

  it.each(['PAID', 'CANCELLED', 'PARTIAL', 'VIEWED'])(
    'leaves a %s invoice unchanged on public view',
    async (status) => {
      mockInvoice(status);
      // The conditional WHERE naturally excludes these statuses — no row matches, count 0.
      prisma.invoice.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.findByIdPublic('inv-1');

      expect(prisma.invoice.updateMany).toHaveBeenCalledWith({
        where: { id: 'inv-1', status: { in: ['SENT', 'OVERDUE'] } },
        data:  { status: 'VIEWED' },
      });
      expect(result.status).toBe(status);
    },
  );

  it('throws NotFoundException when the invoice does not exist', async () => {
    prisma.invoice.findUnique.mockResolvedValue(null);

    await expect(service.findByIdPublic('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
  });

  describe('create()', () => {
    const baseLineItems = [{ description: 'x', qty: 1, rate: 100, gstRate: 18 }];

    beforeEach(() => {
      // generateInvoiceNumber()'s uniqueness probe — no prior invoice this year.
      prisma.invoice.findFirst.mockResolvedValue(null);
      prisma.invoice.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(data));
    });

    it('regression: behaves exactly as before when dto.currency is already sent — no Contact/Workspace lookup', async () => {
      const result: any = await service.create('ws-1', {
        lineItems: baseLineItems, currency: 'USD', contactId: 'contact-1',
      } as any);

      expect(prisma.contact.findUnique).not.toHaveBeenCalled();
      expect(prisma.workspace.findUnique).not.toHaveBeenCalled();
      expect(result.currency).toBe('USD');
      expect(result.gstType).toBe('EXEMPT');
    });

    it('regression: an explicit INR currency behaves exactly as before', async () => {
      const result: any = await service.create('ws-1', {
        lineItems: baseLineItems, currency: 'INR',
      } as any);

      expect(result.currency).toBe('INR');
      expect(result.gstType).toBe('IGST');
    });

    it('inherits currency from a linked Contact when dto.currency is omitted (previously would have defaulted to INR unconditionally)', async () => {
      prisma.contact.findUnique.mockResolvedValue({ currency: 'EUR' });

      const result: any = await service.create('ws-1', {
        lineItems: baseLineItems, contactId: 'contact-1',
      } as any);

      expect(prisma.contact.findUnique).toHaveBeenCalledWith({
        where:  { id: 'contact-1', workspaceId: 'ws-1' },
        select: { currency: true },
      });
      expect(result.currency).toBe('EUR');
      expect(result.gstType).toBe('EXEMPT');
    });

    it('falls through to the Workspace currency when no contactId is given (R8)', async () => {
      prisma.workspace.findUnique.mockResolvedValue({ currency: 'GBP' });

      const result: any = await service.create('ws-1', { lineItems: baseLineItems } as any);

      expect(prisma.contact.findUnique).not.toHaveBeenCalled();
      expect(prisma.workspace.findUnique).toHaveBeenCalledWith({
        where:  { id: 'ws-1' },
        select: { currency: true },
      });
      expect(result.currency).toBe('GBP');
    });

    // U6/KTD6: dto.notes was declared on CreateInvoiceDto but silently dropped --
    // this is the regression test proving it's now persisted.
    it('persists dto.notes when supplied', async () => {
      const result: any = await service.create('ws-1', {
        lineItems: baseLineItems, notes: 'Pay within 15 days',
      } as any);

      expect(result.notes).toBe('Pay within 15 days');
    });

    it('regression: create() without notes behaves exactly as before (notes null, no new required field)', async () => {
      const result: any = await service.create('ws-1', { lineItems: baseLineItems } as any);

      expect(result.notes).toBeNull();
    });
  });

  describe('createFromContract()', () => {
    const baseContract = {
      id:          'contract-1',
      workspaceId: 'ws-1',
      status:      'SIGNED',
      title:       'Contract title',
      clientId:    'client-1',
      client:      { id: 'client-1' },
      contact:     { id: 'contact-1' },
      content:     { totalAmount: 1000, gstAmount: 0, paymentSchedule: [] },
    };

    beforeEach(() => {
      prisma.invoice.findMany.mockResolvedValue([]); // no invoice already generated
      prisma.invoice.findFirst.mockResolvedValue(null); // invoice-numbering probe
      prisma.invoice.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(data));
    });

    it("carries the Contract's own currency forward, not a fresh Contact lookup", async () => {
      prisma.contract.findFirst.mockResolvedValue({ ...baseContract, currency: 'USD' });

      const [inv]: any = await service.createFromContract('ws-1', 'contract-1');

      expect(prisma.contact.findUnique).not.toHaveBeenCalled();
      expect(prisma.workspace.findUnique).not.toHaveBeenCalled();
      expect(inv.currency).toBe('USD');
    });

    it("lands on the INR floor for a pre-U6 Contract with currency: null, confirming no fresh lookup runs", async () => {
      prisma.contract.findFirst.mockResolvedValue({ ...baseContract, currency: null });

      const [inv]: any = await service.createFromContract('ws-1', 'contract-1');

      expect(prisma.contact.findUnique).not.toHaveBeenCalled();
      expect(prisma.workspace.findUnique).not.toHaveBeenCalled();
      expect(inv.currency).toBe('INR');
    });

    it('creates one DRAFT invoice per milestone, each carrying the Contract currency forward, when the Contract has a paymentSchedule', async () => {
      prisma.contract.findFirst.mockResolvedValue({
        ...baseContract,
        currency: 'EUR',
        content: {
          totalAmount: 1000,
          gstAmount:   0,
          paymentSchedule: [
            { milestone: 'Kickoff', amount: 400 },
            { milestone: 'Delivery', amount: 600 },
          ],
        },
      });

      const invoices: any[] = await service.createFromContract('ws-1', 'contract-1');

      expect(prisma.contact.findUnique).not.toHaveBeenCalled();
      expect(prisma.workspace.findUnique).not.toHaveBeenCalled();
      expect(invoices).toHaveLength(2);
      expect(invoices[0].currency).toBe('EUR');
      expect(invoices[1].currency).toBe('EUR');
      expect(invoices[0].lineItems[0].description).toBe('Kickoff');
      expect(invoices[0].lineItems[0].rate).toBe(400);
      expect(invoices[1].lineItems[0].description).toBe('Delivery');
      expect(invoices[1].lineItems[0].rate).toBe(600);
    });

    // U6/KTD3/KTD6: the default Invoice template's `notes` text becomes the
    // generated Invoice's boilerplate slot, read live off the template table.
    it("sets the generated Invoice's notes from the default Invoice template", async () => {
      prisma.contract.findFirst.mockResolvedValue({ ...baseContract, currency: 'INR' });
      invoiceTemplates.getDefault.mockResolvedValue({
        id: 'tmpl-1', content: { notes: 'Standard payment terms apply.' },
      });

      const [inv]: any = await service.createFromContract('ws-1', 'contract-1');

      expect(invoiceTemplates.getDefault).toHaveBeenCalledWith('ws-1');
      expect(inv.notes).toBe('Standard payment terms apply.');
    });

    // Edge case: no default template exists yet (pre-seed state) -- unlike
    // Contract's clauses (KTD5), Invoice's notes has no hardcoded fallback, so
    // `null` here matches today's (pre-U6) behavior exactly.
    it("sets the generated Invoice's notes to null when no default template exists", async () => {
      prisma.contract.findFirst.mockResolvedValue({ ...baseContract, currency: 'INR' });
      invoiceTemplates.getDefault.mockResolvedValue(null);

      const [inv]: any = await service.createFromContract('ws-1', 'contract-1');

      expect(inv.notes).toBeNull();
    });

    // Integration: the multi-milestone branch (one invoice per milestone)
    // applies the same default-template notes value to every generated invoice.
    it('applies the same default-template notes value to every invoice in the multi-milestone branch', async () => {
      prisma.contract.findFirst.mockResolvedValue({
        ...baseContract,
        currency: 'INR',
        content: {
          totalAmount: 1000,
          gstAmount:   0,
          paymentSchedule: [
            { milestone: 'Kickoff', amount: 400 },
            { milestone: 'Delivery', amount: 600 },
          ],
        },
      });
      invoiceTemplates.getDefault.mockResolvedValue({
        id: 'tmpl-1', content: { notes: 'Standard payment terms apply.' },
      });

      const invoices: any[] = await service.createFromContract('ws-1', 'contract-1');

      expect(invoices).toHaveLength(2);
      expect(invoices[0].notes).toBe('Standard payment terms apply.');
      expect(invoices[1].notes).toBe('Standard payment terms apply.');
    });
  });

  describe('update()', () => {
    const existingInvoice = {
      id:          'inv-1',
      workspaceId: 'ws-1',
      status:      'DRAFT',
      contactId:   'contact-1',
      currency:    'INR',
      gstType:     'IGST',
      lineItems:   [{ description: 'x', qty: 1, rate: 100, gstRate: 18 }],
    };

    beforeEach(() => {
      prisma.invoice.findFirst.mockResolvedValue(existingInvoice);
      // U6: drop undefined-valued keys before merging, the same way Prisma itself
      // omits `undefined` fields from the generated UPDATE (only a literal `null`
      // clears a column) -- without this, the ternary-based notes/tdsRate fields
      // would appear to "clear" on every update that doesn't touch them.
      prisma.invoice.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        const defined = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
        return Promise.resolve({ ...existingInvoice, ...defined });
      });
    });

    // review-fix: previously update() never touched currency at all, so
    // reassigning an Invoice to a different Contact left it permanently on
    // its original currency -- unlike Proposal/Contract's update(), which
    // already resolved this. Resolved against the NEW contactId, not the
    // Invoice's existing one.
    it('re-resolves currency and forces EXEMPT gstType when reassigned to a non-INR Contact', async () => {
      prisma.contact.findUnique.mockResolvedValue({ currency: 'USD' });

      const result: any = await service.update('ws-1', 'inv-1', { contactId: 'contact-2' } as any);

      expect(prisma.contact.findUnique).toHaveBeenCalledWith({
        where:  { id: 'contact-2', workspaceId: 'ws-1' },
        select: { currency: true },
      });
      expect(result.currency).toBe('USD');
      expect(result.gstType).toBe('EXEMPT');
    });

    it('re-resolves currency when dto.currency is sent directly, without a Contact lookup', async () => {
      const result: any = await service.update('ws-1', 'inv-1', { currency: 'GBP' } as any);

      expect(prisma.contact.findUnique).not.toHaveBeenCalled();
      expect(result.currency).toBe('GBP');
      expect(result.gstType).toBe('EXEMPT');
    });

    it('does not resolve or touch currency for a pure lineItems/metadata edit', async () => {
      const result: any = await service.update('ws-1', 'inv-1', {
        lineItems: [{ description: 'y', qty: 2, rate: 50, gstRate: 18 }],
      } as any);

      expect(prisma.contact.findUnique).not.toHaveBeenCalled();
      expect(result.currency).toBe('INR');
      expect(result.gstType).toBe('IGST');
    });

    // U6/KTD6: update() previously never touched notes -- confirms a new value overwrites it.
    it('overwrites notes with a new value', async () => {
      const result: any = await service.update('ws-1', 'inv-1', { notes: 'Updated terms' } as any);

      expect(result.notes).toBe('Updated terms');
    });

    // KTD6/tdsRate pattern: sending no `notes` computes an `undefined` value for
    // that key, which Prisma omits from the generated UPDATE entirely (only a
    // literal `null` clears a column) -- so the persisted value is left untouched.
    it('regression: update() without notes leaves the persisted value untouched (no new required field)', async () => {
      await service.update('ws-1', 'inv-1', {
        lineItems: [{ description: 'y', qty: 2, rate: 50, gstRate: 18 }],
      } as any);

      expect(prisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ notes: undefined }) }),
      );
    });
  });

  // U8/R8/R9/KTD7/KTD1: re-apply replaces only `notes` (Invoice's boilerplate
  // slot), is blocked only on PAID, and must resolve the named template through
  // InvoiceTemplatesService.findOne() -- the workspace-scoped lookup -- never a
  // bare prisma.invoiceTemplate.findUnique({ where: { id } }), which would leak
  // another workspace's template content (the IDOR class KTD1 documents).
  describe('reapplyTemplate()', () => {
    const existingInvoice = {
      id:          'inv-1',
      workspaceId: 'ws-1',
      status:      'DRAFT',
      lineItems:   [{ description: 'x', qty: 1, rate: 100, gstRate: 18 }],
      subtotal:    100,
      gstAmount:   18,
      total:       118,
      notes:       'Old notes',
    };

    beforeEach(() => {
      // Merge the update's `data` onto whatever findFirst() resolved for this
      // test (not the fixed `existingInvoice` constant) so a test asserting
      // "status unchanged" for a non-DRAFT invoice sees its own status echoed back.
      prisma.invoice.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
        const found = await prisma.invoice.findFirst.mock.results.at(-1)?.value;
        return { ...existingInvoice, ...found, ...data };
      });
    });

    it('replaces notes on a DRAFT invoice, leaving line items/amounts/status unchanged', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ ...existingInvoice, status: 'DRAFT' });
      invoiceTemplates.findOne.mockResolvedValue({
        id: 'tmpl-2', content: { notes: 'New boilerplate notes' },
      });

      const result: any = await service.reapplyTemplate('ws-1', 'inv-1', { templateId: 'tmpl-2' });

      expect(invoiceTemplates.findOne).toHaveBeenCalledWith('ws-1', 'tmpl-2');
      expect(prisma.invoice.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'inv-1' }, data: { notes: 'New boilerplate notes' } }),
      );
      expect(result.notes).toBe('New boilerplate notes');
      expect(result.lineItems).toEqual(existingInvoice.lineItems);
      expect(result.subtotal).toBe(100);
      expect(result.gstAmount).toBe(18);
      expect(result.total).toBe(118);
      expect(result.status).toBe('DRAFT');
    });

    it.each(['SENT', 'VIEWED', 'PARTIAL', 'OVERDUE'])(
      'succeeds on a %s invoice (not blocked, per KTD7 -- only PAID blocks)',
      async (status) => {
        prisma.invoice.findFirst.mockResolvedValue({ ...existingInvoice, status });
        invoiceTemplates.findOne.mockResolvedValue({
          id: 'tmpl-2', content: { notes: 'New boilerplate notes' },
        });

        const result: any = await service.reapplyTemplate('ws-1', 'inv-1', { templateId: 'tmpl-2' });

        expect(result.notes).toBe('New boilerplate notes');
        expect(result.status).toBe(status);
      },
    );

    it('rejects re-applying a template on a PAID invoice', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ ...existingInvoice, status: 'PAID' });

      await expect(
        service.reapplyTemplate('ws-1', 'inv-1', { templateId: 'tmpl-2' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(invoiceTemplates.findOne).not.toHaveBeenCalled();
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('rejects when templateId belongs to a different workspace', async () => {
      prisma.invoice.findFirst.mockResolvedValue({ ...existingInvoice, status: 'DRAFT' });
      invoiceTemplates.findOne.mockRejectedValue(new NotFoundException('Template not found'));

      await expect(
        service.reapplyTemplate('ws-1', 'inv-1', { templateId: 'tmpl-other-ws' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.invoice.update).not.toHaveBeenCalled();
    });
  });
});

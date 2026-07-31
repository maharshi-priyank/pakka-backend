import { resolveDocumentCurrency } from './resolve-document-currency';

// R5/R7/R8/KTD1: single resolution point for a document's effective currency
// and export status, reused by Proposal/Contract/Invoice create() and update().
describe('resolveDocumentCurrency()', () => {
  let prisma: {
    contact:   { findUnique: jest.Mock };
    workspace: { findUnique: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      contact:   { findUnique: jest.fn() },
      workspace: { findUnique: jest.fn() },
    };
  });

  it('returns the requested currency unresolved and makes no Prisma calls when present', async () => {
    const result = await resolveDocumentCurrency({
      prisma: prisma as any,
      workspaceId: 'ws-1',
      contactId: 'contact-1',
      requestedCurrency: 'USD',
    });

    expect(result).toEqual({ currency: 'USD', isExport: true });
    expect(prisma.contact.findUnique).not.toHaveBeenCalled();
    expect(prisma.workspace.findUnique).not.toHaveBeenCalled();
  });

  it('resolves via the linked Contact when no currency is requested', async () => {
    prisma.contact.findUnique.mockResolvedValue({ currency: 'EUR' });

    const result = await resolveDocumentCurrency({
      prisma: prisma as any,
      workspaceId: 'ws-1',
      contactId: 'contact-1',
    });

    expect(result).toEqual({ currency: 'EUR', isExport: true });
    expect(prisma.contact.findUnique).toHaveBeenCalledWith({
      where:  { id: 'contact-1', workspaceId: 'ws-1' },
      select: { currency: true },
    });
    expect(prisma.workspace.findUnique).not.toHaveBeenCalled();
  });

  it('falls through to the Workspace when the linked Contact has no currency', async () => {
    prisma.contact.findUnique.mockResolvedValue({ currency: null });
    prisma.workspace.findUnique.mockResolvedValue({ currency: 'GBP' });

    const result = await resolveDocumentCurrency({
      prisma: prisma as any,
      workspaceId: 'ws-1',
      contactId: 'contact-1',
    });

    expect(result).toEqual({ currency: 'GBP', isExport: true });
    expect(prisma.workspace.findUnique).toHaveBeenCalledWith({
      where:  { id: 'ws-1' },
      select: { currency: true },
    });
  });

  it('falls through to the Workspace when the contactId does not match this workspace', async () => {
    // where: { id, workspaceId } returns no row for a mismatched/stale contactId.
    prisma.contact.findUnique.mockResolvedValue(null);
    prisma.workspace.findUnique.mockResolvedValue({ currency: 'AED' });

    const result = await resolveDocumentCurrency({
      prisma: prisma as any,
      workspaceId: 'ws-1',
      contactId: 'contact-from-another-workspace',
    });

    expect(result).toEqual({ currency: 'AED', isExport: true });
  });

  it('skips the Contact lookup entirely when no contactId is given', async () => {
    prisma.workspace.findUnique.mockResolvedValue({ currency: 'USD' });

    const result = await resolveDocumentCurrency({
      prisma: prisma as any,
      workspaceId: 'ws-1',
    });

    expect(result).toEqual({ currency: 'USD', isExport: true });
    expect(prisma.contact.findUnique).not.toHaveBeenCalled();
  });

  it('falls through to INR when neither Contact nor Workspace has a currency', async () => {
    prisma.contact.findUnique.mockResolvedValue({ currency: null });
    prisma.workspace.findUnique.mockResolvedValue({ currency: null });

    const result = await resolveDocumentCurrency({
      prisma: prisma as any,
      workspaceId: 'ws-1',
      contactId: 'contact-1',
    });

    expect(result).toEqual({ currency: 'INR', isExport: false });
  });

  it('reports isExport: false whenever the resolved currency is INR', async () => {
    const result = await resolveDocumentCurrency({
      prisma: prisma as any,
      workspaceId: 'ws-1',
      requestedCurrency: 'INR',
    });

    expect(result).toEqual({ currency: 'INR', isExport: false });
  });
});

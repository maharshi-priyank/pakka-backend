import { PrismaService } from '../../prisma/prisma.service';

export interface ResolveDocumentCurrencyInput {
  prisma: PrismaService;
  workspaceId: string;
  contactId?: string | null;
  requestedCurrency?: string | null;
}

export interface ResolveDocumentCurrencyResult {
  currency: string;
  isExport: boolean;
}

// R5/R7/R8/KTD1: the single place that decides a document's effective currency
// and export status, reused by Proposal/Contract/Invoice create() and update().
// Resolution order: requestedCurrency -> linked Contact's currency (scoped to
// workspaceId, so a mismatched/stale contactId can never resolve another
// workspace's Contact -- see KTD1) -> Workspace's currency -> 'INR' floor.
export async function resolveDocumentCurrency({
  prisma,
  workspaceId,
  contactId,
  requestedCurrency,
}: ResolveDocumentCurrencyInput): Promise<ResolveDocumentCurrencyResult> {
  let currency = requestedCurrency ?? undefined;

  if (!currency && contactId) {
    const contact = await prisma.contact.findUnique({
      where:  { id: contactId, workspaceId },
      select: { currency: true },
    });
    currency = contact?.currency ?? undefined;
  }

  if (!currency) {
    const workspace = await prisma.workspace.findUnique({
      where:  { id: workspaceId },
      select: { currency: true },
    });
    currency = workspace?.currency ?? undefined;
  }

  currency ??= 'INR';

  return { currency, isExport: currency !== 'INR' };
}

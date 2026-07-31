// KTD4/KTD6/U3: seed content for the one real, per-workspace "system-default"
// InvoiceTemplate row (see invoice-templates.service.ts's seedDefault()).
// Unlike proposal-templates/system-templates.ts's virtual SYSTEM_TEMPLATES
// library, this is a single entry that becomes a real, mutable DB row per
// workspace — so it's exported as one object, not an array. Mirrors the
// shape of contract-templates/default-content.ts (DEFAULT_CONTRACT_CONTENT).
//
// `content.notes` is the only boilerplate field ever read by
// InvoicesService.createFromContract()/reapply-template (KTD6) — `lineItems`
// is intentionally omitted here since the seeded template has no starting
// line items of its own; it's only a from-scratch aid for user-created
// templates (never applied during automation or re-apply merges).
export const DEFAULT_INVOICE_CONTENT = {
  description: 'A general-purpose invoice with standard payment-terms wording. Used automatically for new Invoices unless another template is set as default.',
  category:    'General',
  content: {
    notes: 'Thank you for your business. Payment is due within the terms agreed for this engagement. Please reach out if you have any questions about this invoice or need to discuss payment arrangements.',
  },
};

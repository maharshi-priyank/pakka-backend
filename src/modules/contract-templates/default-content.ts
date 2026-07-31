// KTD5/U2: seed content for the one real, per-workspace "system-default"
// ContractTemplate row (see contract-templates.service.ts's seedDefault()).
// Unlike proposal-templates/system-templates.ts's virtual SYSTEM_TEMPLATES
// library, this is a single entry that becomes a real, mutable DB row per
// workspace — so it's exported as one object, not an array.
//
// Shape mirrors Contract.content as built by
// ContractsService.createFromProposal() (contracts.service.ts): intro,
// projectDescription, scopeItems, deliverables, exclusions, paymentSchedule,
// clauses: [{ title, body }, { title, body }]. Only clauses[0]/[1]
// ("Payment Terms" / "Terms & Conditions") are ever read as boilerplate by
// createFromProposal()/reapply-template (KTD5, matched by array position,
// never by title) — the other fields are always overwritten by real Proposal
// data (R7) and are left as empty placeholders here since a from-scratch
// manual Contract (R2/R3) is the only flow that would ever see them as-is.
export const DEFAULT_CONTRACT_CONTENT = {
  description: 'A general-purpose contract with standard payment and terms clauses. Used automatically for new Contracts unless another template is set as default.',
  category:    'General',
  content: {
    intro:              'This agreement is entered into between the service provider and the client for the project described below.',
    projectDescription: 'Describe the project scope and objectives here.',
    scopeItems:          [] as unknown[],
    deliverables:        [] as unknown[],
    exclusions:          [] as unknown[],
    paymentSchedule:      [] as unknown[],
    clauses: [
      {
        title: 'Payment Terms',
        body:  '50% advance is payable before work begins. The remaining 50% is due upon final delivery. Payments not received within 7 days of the due date may attract a 2% monthly late fee.',
      },
      {
        title: 'Terms & Conditions',
        body:  'This agreement is governed by the laws of India. Either party may terminate this agreement with 15 days\' written notice; work already completed will be billed pro-rata. All deliverables remain the property of the service provider until final payment is received in full. Confidential information exchanged during this engagement will not be disclosed to any third party.',
      },
    ],
  },
};

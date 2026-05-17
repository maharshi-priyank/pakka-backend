export interface InvoiceTemplateVars {
  clientName:    string
  businessName:  string
  userEmail:     string
  invoiceNumber: string
  total:         string
  dueDate:       string
  overdueByDays: number
  paymentLink:   string
  viewUrl:       string
}

export interface ContractTemplateVars {
  clientName:    string
  businessName:  string
  contractTitle: string
  signLink:      string
}

export interface ProposalTemplateVars {
  clientName:    string
  businessName:  string
  proposalTitle: string
  proposalLink:  string
  validUntil:    string
}

export interface LeadTemplateVars {
  leadName:          string
  businessName:      string
  service:           string
  lastActivityDays:  number
}

export interface DigestTemplateVars {
  businessName:      string
  revenueThisMonth:  string
  activeLeads:       number
  overdueCount:      number
  openProposals:     number
  followUpsCount:    number
}

export interface MeetingTemplateVars {
  recipientName:  string
  businessName:   string
  meetingTitle:   string
  scheduledAt:    string
  durationMins:   number
  meetLink:       string | null
  agenda:         string | null
}

export type TemplateVars =
  | InvoiceTemplateVars
  | ContractTemplateVars
  | ProposalTemplateVars
  | LeadTemplateVars
  | DigestTemplateVars
  | MeetingTemplateVars

export interface EmailTemplate {
  subject: (vars: TemplateVars) => string
  html:    (vars: TemplateVars) => string
}

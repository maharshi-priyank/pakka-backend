/**
 * Documents what {{variables}} are available in each template key.
 * Used to power the variable picker UI in the email template editor.
 */

export interface TemplateVarMeta {
  name: string
  description: string
  sample: string
}

export interface TemplateKeyMeta {
  key: string
  label: string
  category: 'invoice' | 'proposal' | 'contract' | 'lead' | 'meeting' | 'digest'
  description: string
  vars: TemplateVarMeta[]
  /** Variables that control conditional blocks (documented only, not substituted) */
  conditionalVars?: TemplateVarMeta[]
}

const COMMON_INVOICE_VARS: TemplateVarMeta[] = [
  { name: 'clientName',    description: 'Client full name',              sample: 'Prashant Mehta'   },
  { name: 'invoiceNumber', description: 'Invoice number (e.g. INV-001)', sample: 'INV-001'           },
  { name: 'total',         description: 'Total amount with ₹ symbol',    sample: '₹25,000'          },
  { name: 'dueDate',       description: 'Due date (formatted)',           sample: '5 Jun 2026'       },
  { name: 'businessName',  description: 'Your business name',            sample: 'Studio Rao'       },
  { name: 'viewUrl',       description: 'Link to view invoice in portal', sample: 'https://app.clearwork.in/portal/...' },
  { name: 'paymentLink',   description: 'Razorpay payment link (if set)', sample: 'https://rzp.io/...' },
]

export const TEMPLATE_REGISTRY: TemplateKeyMeta[] = [
  // ── Invoice ─────────────────────────────────────────────────────────────────
  {
    key: 'invoice_client_link',
    label: 'New Invoice Sent',
    category: 'invoice',
    description: 'Sent to client when a new invoice is issued.',
    vars: COMMON_INVOICE_VARS,
  },
  {
    key: 'invoice_due_soon',
    label: 'Invoice Due Soon (3 days)',
    category: 'invoice',
    description: 'Reminder sent 3 days before the invoice due date.',
    vars: COMMON_INVOICE_VARS,
  },
  {
    key: 'invoice_reminder_d3',
    label: 'Invoice Overdue — Day 3',
    category: 'invoice',
    description: 'First overdue reminder sent 3 days after the due date.',
    vars: [
      ...COMMON_INVOICE_VARS,
      { name: 'overdueByDays', description: 'Number of days overdue', sample: '3' },
    ],
  },
  {
    key: 'invoice_reminder_d7',
    label: 'Invoice Overdue — Day 7',
    category: 'invoice',
    description: 'Second overdue reminder sent 7 days after the due date.',
    vars: [
      ...COMMON_INVOICE_VARS,
      { name: 'overdueByDays', description: 'Number of days overdue', sample: '7' },
    ],
  },
  {
    key: 'invoice_reminder_d14',
    label: 'Invoice Overdue — Day 14 (Final)',
    category: 'invoice',
    description: 'Final overdue notice sent 14 days after the due date.',
    vars: [
      ...COMMON_INVOICE_VARS,
      { name: 'overdueByDays', description: 'Number of days overdue', sample: '14' },
    ],
  },
  {
    key: 'invoice_paid_thanks',
    label: 'Payment Received',
    category: 'invoice',
    description: 'Thank-you email sent to client when payment is confirmed.',
    vars: [
      { name: 'clientName',    description: 'Client full name',              sample: 'Prashant Mehta' },
      { name: 'invoiceNumber', description: 'Invoice number',                sample: 'INV-001'         },
      { name: 'total',         description: 'Amount paid',                   sample: '₹25,000'        },
      { name: 'businessName',  description: 'Your business name',            sample: 'Studio Rao'     },
      { name: 'viewUrl',       description: 'Link to portal',                sample: 'https://app.clearwork.in/portal/...' },
    ],
  },

  // ── Proposal ────────────────────────────────────────────────────────────────
  {
    key: 'proposal_client_link',
    label: 'Proposal Sent to Client',
    category: 'proposal',
    description: 'Sent to client with the proposal review link.',
    vars: [
      { name: 'clientName',   description: 'Client full name',          sample: 'Prashant Mehta'                 },
      { name: 'proposalTitle', description: 'Proposal title',           sample: 'Brand Identity Package'         },
      { name: 'totalAmount',  description: 'Proposal total',            sample: '₹45,000'                       },
      { name: 'validUntil',   description: 'Valid-until date',          sample: '15 Jun 2026'                    },
      { name: 'proposalLink', description: 'Link to view proposal',     sample: 'https://app.clearwork.in/p/...'   },
      { name: 'businessName', description: 'Your business name',        sample: 'Studio Rao'                     },
    ],
  },
  {
    key: 'proposal_expiry_notice',
    label: 'Proposal Expiring Soon',
    category: 'proposal',
    description: 'Sent to client 2 days before a proposal expires.',
    vars: [
      { name: 'clientName',    description: 'Client full name',    sample: 'Prashant Mehta'               },
      { name: 'proposalTitle', description: 'Proposal title',      sample: 'Brand Identity Package'       },
      { name: 'validUntil',    description: 'Expiry date',         sample: '15 Jun 2026'                  },
      { name: 'proposalLink',  description: 'Link to proposal',    sample: 'https://app.clearwork.in/p/...' },
      { name: 'businessName',  description: 'Your business name',  sample: 'Studio Rao'                   },
    ],
  },
  {
    key: 'proposal_not_opened_alert',
    label: 'Proposal Not Opened Alert (Freelancer)',
    category: 'proposal',
    description: 'Alert to you (the freelancer) when a sent proposal hasn\'t been opened after 48h.',
    vars: [
      { name: 'clientName',    description: 'Client name',         sample: 'Prashant Mehta'               },
      { name: 'proposalTitle', description: 'Proposal title',      sample: 'Brand Identity Package'       },
      { name: 'sentAgo',       description: 'When it was sent',    sample: '2 days ago'                   },
      { name: 'proposalLink',  description: 'Link to proposal',    sample: 'https://app.clearwork.in/p/...' },
    ],
  },
  {
    key: 'proposal_viewed_alert',
    label: 'Proposal Viewed Alert (Freelancer)',
    category: 'proposal',
    description: 'Push alert to you when a client opens your proposal.',
    vars: [
      { name: 'clientName',    description: 'Client name',                sample: 'Prashant Mehta'               },
      { name: 'proposalTitle', description: 'Proposal title',             sample: 'Brand Identity Package'       },
      { name: 'viewedAt',      description: 'When they opened it',        sample: '28 May 2026, 3:15 PM'         },
      { name: 'proposalUrl',   description: 'Link to proposal',           sample: 'https://app.clearwork.in/p/...' },
    ],
  },

  // ── Contract ────────────────────────────────────────────────────────────────
  {
    key: 'contract_client_sign',
    label: 'Contract Sent for Signing',
    category: 'contract',
    description: 'Sent to client with the e-signature link.',
    vars: [
      { name: 'clientName',    description: 'Client full name',       sample: 'Prashant Mehta'                    },
      { name: 'contractTitle', description: 'Contract title',         sample: 'Brand Identity Contract'            },
      { name: 'signLink',      description: 'Link to sign contract',  sample: 'https://app.clearwork.in/sign/...'    },
      { name: 'businessName',  description: 'Your business name',     sample: 'Studio Rao'                         },
    ],
  },

  // ── Lead ────────────────────────────────────────────────────────────────────
  {
    key: 'lead_cold_alert',
    label: 'Lead Gone Cold (Freelancer)',
    category: 'lead',
    description: 'Alert to you when a lead has had no activity for 7 days.',
    vars: [
      { name: 'leadName',         description: 'Lead name',                  sample: 'Rohan Verma' },
      { name: 'businessName',     description: 'Your business name',         sample: 'Studio Rao'  },
      { name: 'service',          description: 'Service enquired about',     sample: 'Logo Design' },
      { name: 'lastActivityDays', description: 'Days since last activity',   sample: '7'           },
    ],
  },
  {
    key: 'lead_new_enquiry',
    label: 'New Lead / Enquiry (Freelancer)',
    category: 'lead',
    description: 'Alert to you when a new lead is created (e.g. from intake form).',
    vars: [
      { name: 'leadName',         description: 'Lead name',                  sample: 'Rohan Verma' },
      { name: 'businessName',     description: 'Your business name',         sample: 'Studio Rao'  },
      { name: 'service',          description: 'Service enquired about',     sample: 'Logo Design' },
      { name: 'lastActivityDays', description: 'Days since last activity',   sample: '0'           },
    ],
  },

  // ── Meeting ──────────────────────────────────────────────────────────────────
  {
    key: 'meeting_scheduled_client',
    label: 'Meeting Confirmed (Client)',
    category: 'meeting',
    description: 'Sent to client when a meeting is confirmed.',
    vars: [
      { name: 'recipientName', description: 'Recipient name',       sample: 'Prashant Mehta'       },
      { name: 'meetingTitle',  description: 'Meeting title',        sample: 'Project Kickoff Call' },
      { name: 'scheduledAt',   description: 'Meeting date & time',  sample: 'Thursday, 5 June 2026, 11:00 AM' },
      { name: 'durationMins',  description: 'Duration in minutes',  sample: '60'                   },
      { name: 'meetLink',      description: 'Video link (if set)',  sample: 'https://meet.google.com/...' },
      { name: 'businessName',  description: 'Your business name',   sample: 'Studio Rao'           },
    ],
  },
  {
    key: 'meeting_reminder',
    label: 'Meeting Reminder (Client)',
    category: 'meeting',
    description: 'Reminder sent 1 hour before the meeting.',
    vars: [
      { name: 'recipientName', description: 'Recipient name',       sample: 'Prashant Mehta'       },
      { name: 'meetingTitle',  description: 'Meeting title',        sample: 'Project Kickoff Call' },
      { name: 'scheduledAt',   description: 'Meeting date & time',  sample: 'Thursday, 5 June 2026, 11:00 AM' },
      { name: 'meetLink',      description: 'Video link (if set)',  sample: 'https://meet.google.com/...' },
      { name: 'businessName',  description: 'Your business name',   sample: 'Studio Rao'           },
    ],
  },

  // ── Digest ───────────────────────────────────────────────────────────────────
  {
    key: 'gst_reminder',
    label: 'GST Filing Reminder (Freelancer)',
    category: 'digest',
    description: 'Monthly alert to you with GST summary for the previous month.',
    vars: [
      { name: 'businessName',     description: 'Your business name',          sample: 'Studio Rao'   },
      { name: 'revenueThisMonth', description: 'Revenue collected this month', sample: '₹1,20,000'   },
      { name: 'activeLeads',      description: 'Number of active leads',      sample: '5'            },
      { name: 'overdueCount',     description: 'Overdue invoice count',       sample: '2'            },
      { name: 'openProposals',    description: 'Open proposals count',        sample: '3'            },
      { name: 'followUpsCount',   description: 'Follow-ups due this week',    sample: '4'            },
    ],
  },
  {
    key: 'weekly_digest',
    label: 'Weekly Business Digest (Freelancer)',
    category: 'digest',
    description: 'Weekly summary of revenue, invoices, and pipeline.',
    vars: [
      { name: 'businessName',     description: 'Your business name',          sample: 'Studio Rao'   },
      { name: 'revenueThisMonth', description: 'Revenue collected this month', sample: '₹40,000'    },
      { name: 'activeLeads',      description: 'Number of active leads',      sample: '5'            },
      { name: 'overdueCount',     description: 'Overdue invoice count',       sample: '2'            },
      { name: 'openProposals',    description: 'Open proposals count',        sample: '3'            },
      { name: 'followUpsCount',   description: 'Follow-ups due this week',    sample: '4'            },
    ],
  },
  {
    key: 'monthly_summary',
    label: 'Monthly Business Summary (Freelancer)',
    category: 'digest',
    description: 'End-of-month summary of revenue, leads, and expenses.',
    vars: [
      { name: 'businessName',     description: 'Your business name',          sample: 'Studio Rao'   },
      { name: 'revenueThisMonth', description: 'Revenue collected this month', sample: '₹1,50,000'  },
      { name: 'activeLeads',      description: 'Number of active leads',      sample: '8'            },
      { name: 'overdueCount',     description: 'Overdue invoice count',       sample: '1'            },
      { name: 'openProposals',    description: 'Open proposals count',        sample: '4'            },
      { name: 'followUpsCount',   description: 'Follow-ups due this week',    sample: '3'            },
    ],
  },
  // ── Messages ──────────────────────────────────────────────────────────────
  {
    key:         'message_received',
    label:       'New Message to Client',
    category:    'lead' as const,
    description: 'Sent to the client when you send them a message.',
    vars: [
      { name: 'clientName',   description: 'Client full name',      sample: 'Ritu Sharma'          },
      { name: 'businessName', description: 'Your business name',    sample: 'Studio Rao'           },
      { name: 'messageBody',  description: 'The message text',      sample: 'Hi, proposal ready...' },
      { name: 'portalUrl',    description: 'Link to client portal', sample: 'https://...'          },
    ],
  },
  {
    key:         'client_message_received',
    label:       'Client Replied to Message',
    category:    'lead' as const,
    description: 'Sent to you when a client replies to your message.',
    vars: [
      { name: 'clientName',  description: 'Client full name',   sample: 'Ritu Sharma'  },
      { name: 'messageBody', description: 'The reply text',     sample: 'Sounds great!' },
      { name: 'inboxUrl',    description: 'Link to your inbox', sample: 'https://...'  },
    ],
  },
]

export const TEMPLATE_KEYS = TEMPLATE_REGISTRY.map(t => t.key)

export function getTemplateMeta(key: string): TemplateKeyMeta | undefined {
  return TEMPLATE_REGISTRY.find(t => t.key === key)
}

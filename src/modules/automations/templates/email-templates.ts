import type {
  EmailTemplate, InvoiceTemplateVars, ContractTemplateVars,
  ProposalTemplateVars, LeadTemplateVars, DigestTemplateVars, MeetingTemplateVars, TemplateVars,
} from './template.variables'

// ─── Base layout ─────────────────────────────────────────────────────────────

function layout(content: string, businessName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${businessName}</title>
</head>
<body style="margin:0;padding:0;background:#F5F6FA;font-family:'Inter',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F6FA;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #EAECF0;overflow:hidden;max-width:600px;">

      <!-- Header -->
      <tr>
        <td style="background:#2563EB;padding:20px 32px;">
          <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px;">${businessName}</span>
          <span style="color:#BFDBFE;font-size:12px;font-weight:500;margin-left:8px;">via Clinekt</span>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:32px;">
          ${content}
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="border-top:1px solid #F2F4F7;padding:20px 32px;background:#F9FAFB;">
          <p style="margin:0;font-size:11px;color:#98A2B3;text-align:center;">
            Sent by <strong>${businessName}</strong> using <a href="https://clinekt.io" style="color:#2563EB;text-decoration:none;">Clinekt</a>.
            If you have questions, reply to this email.
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`
}

function h1(text: string): string {
  return `<h1 style="margin:0 0 8px;font-size:22px;font-weight:800;color:#101828;letter-spacing:-0.5px;">${text}</h1>`
}

function p(text: string, muted = false): string {
  const color = muted ? '#667085' : '#344054'
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${color};">${text}</p>`
}

function btn(text: string, url: string, color = '#2563EB'): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td style="background:${color};border-radius:8px;">
        <a href="${url}" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:-0.2px;">${text}</a>
      </td>
    </tr>
  </table>`
}

function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;font-size:13px;color:#667085;width:140px;">${label}</td>
    <td style="padding:8px 0;font-size:13px;color:#101828;font-weight:600;">${value}</td>
  </tr>`
}

function infoTable(rows: [string, string][]): string {
  return `<table style="width:100%;border-top:1px solid #F2F4F7;margin-bottom:24px;">${rows.map(([l, v]) => infoRow(l, v)).join('')}</table>`
}

function alert(text: string, type: 'warning' | 'error' | 'success' = 'warning'): string {
  const bg    = type === 'error' ? '#FEF3F2' : type === 'success' ? '#ECFDF3' : '#FFFAEB'
  const color = type === 'error' ? '#B42318' : type === 'success' ? '#027A48' : '#B54708'
  return `<div style="background:${bg};border-radius:8px;padding:12px 16px;margin-bottom:20px;">
    <p style="margin:0;font-size:13px;font-weight:600;color:${color};">${text}</p>
  </div>`
}

// ─── Templates ────────────────────────────────────────────────────────────────

export const EMAIL_TEMPLATES: Record<string, EmailTemplate> = {

  // Invoice: overdue D+3
  invoice_reminder_d3: {
    subject: (v) => {
      const iv = v as InvoiceTemplateVars
      return `Payment Reminder: ${iv.invoiceNumber} is 3 days overdue`
    },
    html: (v) => {
      const iv = v as InvoiceTemplateVars
      return layout(`
        ${alert(`Invoice ${iv.invoiceNumber} is 3 days overdue`, 'warning')}
        ${h1('Friendly payment reminder')}
        ${p(`Hi ${iv.clientName}, this is a gentle reminder that invoice <strong>${iv.invoiceNumber}</strong> for <strong>${iv.total}</strong> was due on ${iv.dueDate} and is now 3 days overdue.`)}
        ${infoTable([
          ['Invoice', iv.invoiceNumber],
          ['Amount', iv.total],
          ['Due date', iv.dueDate],
          ['Overdue by', `${iv.overdueByDays} days`],
        ])}
        ${iv.paymentLink ? btn('Pay Now →', iv.paymentLink) : btn('View Invoice →', iv.viewUrl)}
        ${p('If you have already made the payment, please ignore this email. Feel free to reply if you have any questions.', true)}
      `, iv.businessName)
    },
  },

  // Invoice: overdue D+7
  invoice_reminder_d7: {
    subject: (v) => {
      const iv = v as InvoiceTemplateVars
      return `2nd Reminder: ${iv.invoiceNumber} — payment overdue by 7 days`
    },
    html: (v) => {
      const iv = v as InvoiceTemplateVars
      return layout(`
        ${alert(`Invoice ${iv.invoiceNumber} is 7 days overdue`, 'error')}
        ${h1('Payment is 7 days overdue')}
        ${p(`Hi ${iv.clientName}, we wanted to follow up on invoice <strong>${iv.invoiceNumber}</strong> for <strong>${iv.total}</strong>. This is our second reminder — the payment is now 7 days past due.`)}
        ${infoTable([
          ['Invoice', iv.invoiceNumber],
          ['Amount', iv.total],
          ['Due date', iv.dueDate],
          ['Overdue by', `${iv.overdueByDays} days`],
        ])}
        ${iv.paymentLink ? btn('Pay Now →', iv.paymentLink) : btn('View Invoice →', iv.viewUrl)}
        ${p('Please let us know if there are any issues. We\'re happy to assist in resolving this quickly.', true)}
      `, iv.businessName)
    },
  },

  // Invoice: overdue D+14 (final notice)
  invoice_reminder_d14: {
    subject: (v) => {
      const iv = v as InvoiceTemplateVars
      return `Final Notice: ${iv.invoiceNumber} — 14 days overdue`
    },
    html: (v) => {
      const iv = v as InvoiceTemplateVars
      return layout(`
        ${alert(`Final notice: Invoice ${iv.invoiceNumber} is 14 days overdue`, 'error')}
        ${h1('Final payment notice')}
        ${p(`Hi ${iv.clientName}, this is our final reminder regarding invoice <strong>${iv.invoiceNumber}</strong> for <strong>${iv.total}</strong>. The payment is now 14 days overdue.`)}
        ${p('Please make payment immediately or contact us to discuss a resolution. Continued non-payment may affect future work together.')}
        ${infoTable([
          ['Invoice', iv.invoiceNumber],
          ['Amount', iv.total],
          ['Due date', iv.dueDate],
          ['Overdue by', `${iv.overdueByDays} days`],
        ])}
        ${iv.paymentLink ? btn('Pay Now →', iv.paymentLink) : btn('View Invoice →', iv.viewUrl)}
      `, iv.businessName)
    },
  },

  // Invoice: due in 3 days (pre-due reminder)
  invoice_due_soon: {
    subject: (v) => {
      const iv = v as InvoiceTemplateVars
      return `Upcoming payment: ${iv.invoiceNumber} is due in 3 days`
    },
    html: (v) => {
      const iv = v as InvoiceTemplateVars
      return layout(`
        ${h1('Payment due in 3 days')}
        ${p(`Hi ${iv.clientName}, just a heads up — invoice <strong>${iv.invoiceNumber}</strong> for <strong>${iv.total}</strong> is due on ${iv.dueDate}.`)}
        ${infoTable([
          ['Invoice', iv.invoiceNumber],
          ['Amount due', iv.total],
          ['Due date', iv.dueDate],
        ])}
        ${iv.paymentLink ? btn('Pay Now →', iv.paymentLink) : btn('View Invoice →', iv.viewUrl)}
        ${p('Thank you for your business! Feel free to reply if you need any clarification.', true)}
      `, iv.businessName)
    },
  },

  // Invoice: paid — thank you
  invoice_paid_thanks: {
    subject: (v) => {
      const iv = v as InvoiceTemplateVars
      return `Payment received — Thank you! (${iv.invoiceNumber})`
    },
    html: (v) => {
      const iv = v as InvoiceTemplateVars
      return layout(`
        ${alert('Payment received — thank you!', 'success')}
        ${h1('Payment confirmed ✓')}
        ${p(`Hi ${iv.clientName}, we've received your payment of <strong>${iv.total}</strong> for invoice <strong>${iv.invoiceNumber}</strong>. Thank you!`)}
        ${infoTable([
          ['Invoice', iv.invoiceNumber],
          ['Amount paid', iv.total],
        ])}
        ${btn('View Receipt →', iv.viewUrl, '#027A48')}
        ${p('It\'s been a pleasure working with you. We look forward to our next project together!', true)}
      `, iv.businessName)
    },
  },

  // Proposal: client hasn't opened after 3 days (alert to USER)
  proposal_not_opened_alert: {
    subject: (v) => {
      const pv = v as ProposalTemplateVars
      return `Follow-up needed: ${pv.clientName} hasn't opened your proposal yet`
    },
    html: (v) => {
      const pv = v as ProposalTemplateVars
      return layout(`
        ${h1('Your proposal hasn\'t been opened yet')}
        ${p(`Your proposal <strong>"${pv.proposalTitle}"</strong> was sent to ${pv.clientName} 3 days ago but hasn't been opened yet.`)}
        ${p('This might be a good time to follow up with them directly — a quick call or message often helps.', true)}
        ${btn('View Proposal →', pv.proposalLink)}
      `, pv.businessName)
    },
  },

  // Proposal: client opened but no response after 2 days (alert to USER)
  proposal_viewed_alert: {
    subject: (v) => {
      const pv = v as ProposalTemplateVars
      return `${pv.clientName} viewed your proposal — follow up now`
    },
    html: (v) => {
      const pv = v as ProposalTemplateVars
      return layout(`
        ${alert('Your client viewed the proposal 2 days ago — they may need a nudge', 'warning')}
        ${h1('Client viewed — no response yet')}
        ${p(`${pv.clientName} opened your proposal <strong>"${pv.proposalTitle}"</strong> but hasn't accepted or replied yet.`)}
        ${p('This is a great moment to follow up — they\'ve shown interest! A short check-in can make all the difference.', true)}
        ${btn('View Proposal →', pv.proposalLink)}
      `, pv.businessName)
    },
  },

  // Proposal: expiring tomorrow (email to CLIENT)
  proposal_expiry_notice: {
    subject: (v) => {
      const pv = v as ProposalTemplateVars
      return `Your proposal from ${pv.businessName} expires tomorrow`
    },
    html: (v) => {
      const pv = v as ProposalTemplateVars
      return layout(`
        ${alert('This proposal expires tomorrow', 'warning')}
        ${h1('Your proposal expires soon')}
        ${p(`Hi ${pv.clientName}, just a reminder that the proposal <strong>"${pv.proposalTitle}"</strong> from ${pv.businessName} expires on <strong>${pv.validUntil}</strong>.`)}
        ${p('If you\'re ready to move forward, you can accept it directly from the link below. If you have questions, feel free to reply.', true)}
        ${btn('View & Accept Proposal →', pv.proposalLink)}
      `, pv.businessName)
    },
  },

  // Contract: not signed after 3 days (email to CLIENT)
  contract_reminder_d3: {
    subject: (v) => {
      const cv = v as ContractTemplateVars
      return `Action needed: Please sign your contract from ${cv.businessName}`
    },
    html: (v) => {
      const cv = v as ContractTemplateVars
      return layout(`
        ${h1('Your contract is waiting for your signature')}
        ${p(`Hi ${cv.clientName}, we sent you a contract <strong>"${cv.contractTitle}"</strong> a few days ago. It's ready for your e-signature — the whole process takes less than a minute.`)}
        ${btn('Sign Contract →', cv.signLink)}
        ${p('If you have any concerns or need changes before signing, just reply to this email.', true)}
      `, cv.businessName)
    },
  },

  // Contract: not signed after 7 days (email to CLIENT)
  contract_reminder_d7: {
    subject: (v) => {
      const cv = v as ContractTemplateVars
      return `Reminder: Contract "${(v as ContractTemplateVars).contractTitle}" awaiting your signature`
    },
    html: (v) => {
      const cv = v as ContractTemplateVars
      return layout(`
        ${alert('Contract unsigned for 7 days', 'warning')}
        ${h1('Contract still awaiting signature')}
        ${p(`Hi ${cv.clientName}, this is a follow-up — your contract <strong>"${cv.contractTitle}"</strong> has been waiting for your signature for 7 days.`)}
        ${p('We\'d love to get started on the project! Could you please take a moment to review and sign?', true)}
        ${btn('Sign Contract →', cv.signLink)}
      `, cv.businessName)
    },
  },

  // Lead: cold alert (to USER)
  lead_cold_alert: {
    subject: (v) => {
      const lv = v as LeadTemplateVars
      return `Cold lead alert: ${lv.leadName} — no activity for ${lv.lastActivityDays} days`
    },
    html: (v) => {
      const lv = v as LeadTemplateVars
      return layout(`
        ${alert(`No activity for ${lv.lastActivityDays} days`, 'warning')}
        ${h1('A lead is going cold')}
        ${p(`<strong>${lv.leadName}</strong>${lv.service ? ` (${lv.service})` : ''} hasn't had any activity in ${lv.lastActivityDays} days.`)}
        ${p('Leads that go cold are hard to revive — consider reaching out today while you\'re still top of mind.', true)}
      `, lv.businessName)
    },
  },

  // Lead: new enquiry auto-reply (to LEAD/CLIENT)
  lead_new_enquiry: {
    subject: (v) => {
      const lv = v as LeadTemplateVars
      return `Thanks for reaching out to ${lv.businessName}`
    },
    html: (v) => {
      const lv = v as LeadTemplateVars
      return layout(`
        ${h1(`Thanks for reaching out, ${lv.leadName}!`)}
        ${p(`We've received your enquiry${lv.service ? ` about <strong>${lv.service}</strong>` : ''} and will get back to you shortly.`)}
        ${p('We typically respond within 1 business day. In the meantime, feel free to reply to this email with any additional details.', true)}
      `, lv.businessName)
    },
  },

  // Business: GST filing reminder (to USER)
  gst_reminder: {
    subject: (v) => {
      const dv = v as DigestTemplateVars
      return `GST Reminder: GSTR-1 filing due soon — ${dv.businessName}`
    },
    html: (v) => {
      const dv = v as DigestTemplateVars
      return layout(`
        ${alert('GSTR-1 is due by the 11th of this month', 'warning')}
        ${h1('GST Filing Reminder')}
        ${p(`Hi, your monthly GSTR-1 filing is due by the <strong>11th of this month</strong>. File early to avoid late fees.`)}
        ${infoTable([
          ['Revenue this month', dv.revenueThisMonth],
          ['Active leads', String(dv.activeLeads)],
          ['Overdue invoices', String(dv.overdueCount)],
        ])}
        ${p('Log in to the GST portal (gst.gov.in) or use your CA to file on time.', true)}
      `, dv.businessName)
    },
  },

  // Business: weekly digest (to USER)
  weekly_digest: {
    subject: (v) => {
      const dv = v as DigestTemplateVars
      return `Your weekly business snapshot — ${dv.businessName}`
    },
    html: (v) => {
      const dv = v as DigestTemplateVars
      return layout(`
        ${h1('Your week at a glance')}
        ${infoTable([
          ['Revenue this month', dv.revenueThisMonth],
          ['Active leads', String(dv.activeLeads)],
          ['Open proposals', String(dv.openProposals)],
          ['Overdue invoices', String(dv.overdueCount)],
          ['Follow-ups due', String(dv.followUpsCount)],
        ])}
        ${dv.overdueCount > 0
          ? alert(`You have ${dv.overdueCount} overdue invoice${dv.overdueCount > 1 ? 's' : ''} — chase them up today!`, 'error')
          : ''}
        ${dv.followUpsCount > 0
          ? alert(`${dv.followUpsCount} follow-up${dv.followUpsCount > 1 ? 's' : ''} due this week`, 'warning')
          : ''}
      `, dv.businessName)
    },
  },

  // Invoice: sent to client (transactional)
  invoice_client_link: {
    subject: (v) => {
      const iv = v as InvoiceTemplateVars
      return `Invoice ${iv.invoiceNumber} from ${iv.businessName}`
    },
    html: (v) => {
      const iv = v as InvoiceTemplateVars
      return layout(`
        ${h1(`You have a new invoice from ${iv.businessName}`)}
        ${p(`Hi ${iv.clientName}, please find your invoice below. Click the button to view the full details and make payment.`)}
        ${infoTable([
          ['Invoice', iv.invoiceNumber],
          ['Amount due', iv.total],
          ...(iv.dueDate && iv.dueDate !== '—' ? [['Due date', iv.dueDate] as [string, string]] : []),
        ])}
        ${iv.paymentLink ? btn('View & Pay Invoice →', iv.paymentLink) : btn('View Invoice →', iv.viewUrl)}
        ${p('If you have any questions about this invoice, please reply to this email.', true)}
      `, iv.businessName)
    },
  },

  // Proposal: sent to client (transactional)
  proposal_client_link: {
    subject: (v) => {
      const pv = v as ProposalTemplateVars
      return `${pv.businessName} sent you a proposal: "${pv.proposalTitle}"`
    },
    html: (v) => {
      const pv = v as ProposalTemplateVars
      return layout(`
        ${h1(`You have a proposal from ${pv.businessName}`)}
        ${p(`Hi ${pv.clientName}, ${pv.businessName} has prepared a proposal for you. Click the button below to view the full details including scope, pricing, and timeline.`)}
        ${infoTable([
          ['Proposal', pv.proposalTitle],
          ...(pv.validUntil && pv.validUntil !== '—' ? [['Valid until', pv.validUntil] as [string, string]] : []),
        ])}
        ${btn('View Proposal →', pv.proposalLink)}
        ${p('You can accept or decline the proposal directly from the link above. Reply to this email if you have any questions.', true)}
      `, pv.businessName)
    },
  },

  // Contract: sent to client for signing (transactional)
  contract_client_sign: {
    subject: (v) => {
      const cv = v as ContractTemplateVars
      return `Please sign your contract — ${cv.businessName}`
    },
    html: (v) => {
      const cv = v as ContractTemplateVars
      return layout(`
        ${h1('Your contract is ready to sign')}
        ${p(`Hi ${cv.clientName}, ${cv.businessName} has sent you a contract <strong>"${cv.contractTitle}"</strong> for your review and signature.`)}
        ${p('Signing takes less than a minute — you\'ll receive a one-time code to confirm your identity and complete the process securely.', true)}
        ${btn('Review & Sign Contract →', cv.signLink)}
        ${p('If you have any questions or need changes before signing, please reply to this email.', true)}
      `, cv.businessName)
    },
  },

  // Business: monthly summary (to USER)
  monthly_summary: {
    subject: (v) => {
      const dv = v as DigestTemplateVars
      return `Monthly summary: ${new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })} — ${dv.businessName}`
    },
    html: (v) => {
      const dv = v as DigestTemplateVars
      return layout(`
        ${h1(`Monthly Business Summary`)}
        ${p(`Here's how ${dv.businessName} performed this month:`)}
        ${infoTable([
          ['Revenue collected', dv.revenueThisMonth],
          ['Active leads', String(dv.activeLeads)],
          ['Open proposals', String(dv.openProposals)],
          ['Overdue invoices', String(dv.overdueCount)],
        ])}
        ${p('Log in to Clinekt to see detailed breakdowns, recent activity, and upcoming follow-ups.', true)}
      `, dv.businessName)
    },
  },

  // Meeting reminder (to USER and CLIENT)
  // Meeting: confirmation sent to client/lead when meeting is scheduled
  meeting_scheduled_client: {
    subject: (v) => {
      const mv = v as MeetingTemplateVars
      return `Meeting confirmed: "${mv.meetingTitle}" on ${mv.scheduledAt}`
    },
    html: (v) => {
      const mv = v as MeetingTemplateVars
      return layout(`
        ${alert('Meeting scheduled ✓', 'success')}
        ${h1('Your meeting is confirmed')}
        ${p(`Hi ${mv.recipientName}, a call has been scheduled with <strong>${mv.businessName}</strong>. Here are the details:`)}
        ${infoTable([
          ['Meeting',  mv.meetingTitle],
          ['Date & Time', mv.scheduledAt],
          ['Duration', mv.durationMins >= 60 ? `${mv.durationMins / 60} hour${mv.durationMins > 60 ? 's' : ''}` : `${mv.durationMins} minutes`],
          ...(mv.agenda ? [['Agenda', mv.agenda] as [string, string]] : []),
        ])}
        ${mv.meetLink ? btn('Join Google Meet →', mv.meetLink, '#059669') : ''}
        ${mv.portalLink ? p(`You can also view this meeting and all your documents in your <a href="${mv.portalLink}" style="color:#2563EB;font-weight:600;">client portal</a>.`, true) : ''}
        ${p('If you have any questions, simply reply to this email.', true)}
      `, mv.businessName)
    },
  },

  meeting_reminder: {
    subject: (v) => {
      const mv = v as MeetingTemplateVars
      return `Reminder: "${mv.meetingTitle}" starts in 1 hour`
    },
    html: (v) => {
      const mv = v as MeetingTemplateVars
      return layout(`
        ${h1(`Your call starts in 1 hour`)}
        ${p(`Hi ${mv.recipientName}, this is a reminder for your upcoming meeting.`)}
        ${infoTable([
          ['Meeting',  mv.meetingTitle],
          ['Time',     mv.scheduledAt],
          ['Duration', `${mv.durationMins} minutes`],
          ...(mv.agenda ? [['Agenda', mv.agenda] as [string, string]] : []),
        ])}
        ${mv.meetLink ? btn('Join Google Meet', mv.meetLink, '#059669') : alert('No Meet link — contact the organiser for joining details.', 'warning')}
      `, mv.businessName)
    },
  },

}

export function renderTemplate(
  templateKey: string,
  vars: TemplateVars,
): { subject: string; html: string } {
  const template = EMAIL_TEMPLATES[templateKey]
  if (!template) throw new Error(`Unknown email template: ${templateKey}`)
  return {
    subject: template.subject(vars),
    html:    template.html(vars),
  }
}

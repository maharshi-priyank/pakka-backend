import type {
  EmailTemplate, InvoiceTemplateVars, ContractTemplateVars,
  ProposalTemplateVars, LeadTemplateVars, DigestTemplateVars, MeetingTemplateVars, TemplateVars,
} from './template.variables'

// ─── Layout ──────────────────────────────────────────────────────────────────

function preheader(text: string): string {
  return `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;color:#ffffff;line-height:1;">${text}&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌&nbsp;‌</div>`
}

export function layout(content: string, businessName: string, preheaderText = ''): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${businessName}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#F4F5F7;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  ${preheaderText ? preheader(preheaderText) : ''}

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F4F5F7;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- ── Header ── -->
          <tr>
            <td style="background:#ffffff;border-radius:12px 12px 0 0;padding:24px 40px 20px;border-bottom:3px solid #4F46E5;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="background:#4F46E5;border-radius:8px;width:32px;height:32px;text-align:center;vertical-align:middle;">
                          <span style="color:#ffffff;font-size:16px;font-weight:800;font-family:Arial,sans-serif;line-height:32px;display:block;">C</span>
                        </td>
                        <td style="padding-left:10px;vertical-align:middle;">
                          <span style="font-size:16px;font-weight:700;color:#111827;font-family:Arial,Helvetica,sans-serif;letter-spacing:-0.3px;">${businessName}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="font-size:11px;color:#9CA3AF;font-family:Arial,Helvetica,sans-serif;font-weight:500;">Powered by Clinekt</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Body ── -->
          <tr>
            <td style="background:#ffffff;padding:36px 40px;">
              ${content}
            </td>
          </tr>

          <!-- ── Footer ── -->
          <tr>
            <td style="background:#F9FAFB;border-top:1px solid #E5E7EB;border-radius:0 0 12px 12px;padding:20px 40px;">
              <p style="margin:0 0 6px;font-size:12px;color:#6B7280;text-align:center;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">
                This email was sent by <strong style="color:#374151;">${businessName}</strong> using
                <a href="https://clinekt.io" style="color:#4F46E5;text-decoration:none;font-weight:600;">Clinekt</a>.
              </p>
              <p style="margin:0;font-size:11px;color:#9CA3AF;text-align:center;font-family:Arial,Helvetica,sans-serif;line-height:1.6;">
                If you have questions about this email, please reply directly to this message.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`
}

// ─── Typography helpers ───────────────────────────────────────────────────────

function h1(text: string): string {
  return `<h1 style="margin:0 0 10px;font-size:26px;font-weight:800;color:#111827;letter-spacing:-0.5px;line-height:1.2;font-family:Arial,Helvetica,sans-serif;">${text}</h1>`
}

function subheading(text: string): string {
  return `<p style="margin:0 0 20px;font-size:14px;font-weight:600;color:#6B7280;font-family:Arial,Helvetica,sans-serif;text-transform:uppercase;letter-spacing:0.5px;">${text}</p>`
}

function p(text: string, muted = false): string {
  const color = muted ? '#6B7280' : '#374151'
  return `<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:${color};font-family:Arial,Helvetica,sans-serif;">${text}</p>`
}

function divider(): string {
  return `<div style="border-top:1px solid #E5E7EB;margin:24px 0;"></div>`
}

// ─── Amount display (invoices) ────────────────────────────────────────────────

function amountBlock(amount: string, label = 'Amount due'): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
    <tr>
      <td style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:20px 24px;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.8px;font-family:Arial,Helvetica,sans-serif;">${label}</p>
        <p style="margin:0;font-size:32px;font-weight:800;color:#111827;letter-spacing:-1px;line-height:1.1;font-family:Arial,Helvetica,sans-serif;">${amount}</p>
      </td>
    </tr>
  </table>`
}

// ─── CTA button ───────────────────────────────────────────────────────────────

function btn(text: string, url: string, color = '#111827'): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td style="background:${color};border-radius:8px;">
        <a href="${url}" target="_blank" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:-0.2px;font-family:Arial,Helvetica,sans-serif;">${text} &rarr;</a>
      </td>
    </tr>
  </table>`
}

// ─── Info card (key-value rows) ───────────────────────────────────────────────

function infoCard(rows: [string, string][]): string {
  const rowsHtml = rows.map(([label, value], i) => `
    <tr>
      <td style="padding:10px 0;font-size:12px;font-weight:600;color:#9CA3AF;text-transform:uppercase;letter-spacing:0.5px;font-family:Arial,Helvetica,sans-serif;width:140px;vertical-align:top;${i > 0 ? 'border-top:1px solid #F3F4F6;' : ''}">${label}</td>
      <td style="padding:10px 0;font-size:14px;font-weight:600;color:#111827;font-family:Arial,Helvetica,sans-serif;vertical-align:top;${i > 0 ? 'border-top:1px solid #F3F4F6;' : ''}">${value}</td>
    </tr>`).join('')

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;padding:4px 20px;margin:20px 0;">
    <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table></td></tr>
  </table>`
}

// ─── Alert banner ─────────────────────────────────────────────────────────────

function alert(text: string, type: 'info' | 'warning' | 'error' | 'success' = 'info'): string {
  const config = {
    info:    { bg: '#EFF6FF', border: '#3B82F6', color: '#1D4ED8', icon: 'ℹ️' },
    warning: { bg: '#FFFBEB', border: '#F59E0B', color: '#92400E', icon: '⚠️' },
    error:   { bg: '#FEF2F2', border: '#EF4444', color: '#991B1B', icon: '🔴' },
    success: { bg: '#F0FDF4', border: '#22C55E', color: '#14532D', icon: '✅' },
  }
  const c = config[type]
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
    <tr>
      <td style="background:${c.bg};border-left:4px solid ${c.border};border-radius:0 8px 8px 0;padding:12px 16px;">
        <p style="margin:0;font-size:13px;font-weight:600;color:${c.color};font-family:Arial,Helvetica,sans-serif;">${c.icon}&nbsp; ${text}</p>
      </td>
    </tr>
  </table>`
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function badge(text: string, color: 'green' | 'amber' | 'red' | 'blue' = 'blue'): string {
  const config = {
    green: { bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
    amber: { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A' },
    red:   { bg: '#FEF2F2', color: '#991B1B', border: '#FECACA' },
    blue:  { bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' },
  }
  const c = config[color]
  return `<span style="display:inline-block;background:${c.bg};color:${c.color};border:1px solid ${c.border};border-radius:20px;padding:3px 10px;font-size:11px;font-weight:700;font-family:Arial,Helvetica,sans-serif;letter-spacing:0.3px;">${text}</span>`
}

// ─── System default templates ──────────────────────────────────────────────────
// These are also the fallback when a user has not customised a template.
// body content uses {{variableName}} placeholders — the same format used for
// user-saved DB templates — so the substitution pipeline is identical.

export const EMAIL_TEMPLATES: Record<string, EmailTemplate> = {

  // ── Invoice: new invoice sent to client ─────────────────────────────────────
  invoice_client_link: {
    subject: (v) => {
      const iv = v as InvoiceTemplateVars
      return `Invoice ${iv.invoiceNumber} from ${iv.businessName}`
    },
    html: (v) => {
      const iv = v as InvoiceTemplateVars
      return layout(`
        ${subheading('New Invoice')}
        ${h1(`Invoice from ${iv.businessName}`)}
        ${p(`Hi ${iv.clientName}, please find your invoice details below. You can view the full invoice and pay securely using the button below.`)}
        ${amountBlock(iv.total)}
        ${infoCard([
          ['Invoice',   iv.invoiceNumber],
          ['Due date',  iv.dueDate && iv.dueDate !== '—' ? iv.dueDate : 'Upon receipt'],
          ['From',      iv.businessName],
        ])}
        ${iv.paymentLink ? btn('View & Pay Invoice', iv.paymentLink, '#4F46E5') : btn('View Invoice', iv.viewUrl)}
        ${divider()}
        ${p('Questions about this invoice? Simply reply to this email.', true)}
      `, iv.businessName, `Invoice ${iv.invoiceNumber} for ${iv.total} from ${iv.businessName}`)
    },
  },

  // ── Invoice: due in 3 days ───────────────────────────────────────────────────
  invoice_due_soon: {
    subject: (v) => {
      const iv = v as InvoiceTemplateVars
      return `Upcoming: ${iv.invoiceNumber} is due in 3 days — ${iv.businessName}`
    },
    html: (v) => {
      const iv = v as InvoiceTemplateVars
      return layout(`
        ${alert('Payment due in 3 days', 'info')}
        ${subheading('Payment Reminder')}
        ${h1('Your invoice is due soon')}
        ${p(`Hi ${iv.clientName}, just a heads-up — invoice <strong>${iv.invoiceNumber}</strong> is due on <strong>${iv.dueDate}</strong>. Please arrange payment at your earliest convenience.`)}
        ${amountBlock(iv.total)}
        ${infoCard([
          ['Invoice',  iv.invoiceNumber],
          ['Due date', iv.dueDate],
        ])}
        ${iv.paymentLink ? btn('Pay Now', iv.paymentLink, '#4F46E5') : btn('View Invoice', iv.viewUrl)}
        ${p('Thank you for your prompt attention. Feel free to reply if you need any clarification.', true)}
      `, iv.businessName, `${iv.invoiceNumber} for ${iv.total} is due on ${iv.dueDate}`)
    },
  },

  // ── Invoice: overdue D+3 ─────────────────────────────────────────────────────
  invoice_reminder_d3: {
    subject: (v) => {
      const iv = v as InvoiceTemplateVars
      return `Friendly reminder: ${iv.invoiceNumber} was due 3 days ago — ${iv.businessName}`
    },
    html: (v) => {
      const iv = v as InvoiceTemplateVars
      return layout(`
        ${alert('Invoice overdue by 3 days', 'warning')}
        ${subheading('Payment Reminder')}
        ${h1('A gentle nudge on your invoice')}
        ${p(`Hi ${iv.clientName}, we hope everything is going well. We noticed that invoice <strong>${iv.invoiceNumber}</strong> for <strong>${iv.total}</strong>, which was due on ${iv.dueDate}, has not yet been settled.`)}
        ${p('If you have already processed the payment, please ignore this message. Otherwise, clicking the button below will let you pay securely in seconds.')}
        ${amountBlock(iv.total, 'Outstanding amount')}
        ${infoCard([
          ['Invoice',    iv.invoiceNumber],
          ['Was due',    iv.dueDate],
          ['Overdue by', `${iv.overdueByDays} days`],
        ])}
        ${iv.paymentLink ? btn('Pay Now', iv.paymentLink, '#4F46E5') : btn('View Invoice', iv.viewUrl)}
        ${divider()}
        ${p('Any questions or issues? Just reply — we are happy to help.', true)}
      `, iv.businessName, `${iv.invoiceNumber} for ${iv.total} is 3 days overdue`)
    },
  },

  // ── Invoice: overdue D+7 ─────────────────────────────────────────────────────
  invoice_reminder_d7: {
    subject: (v) => {
      const iv = v as InvoiceTemplateVars
      return `2nd reminder: ${iv.invoiceNumber} is now 7 days overdue — ${iv.businessName}`
    },
    html: (v) => {
      const iv = v as InvoiceTemplateVars
      return layout(`
        ${alert('Invoice is 7 days overdue — second notice', 'warning')}
        ${subheading('Second Payment Reminder')}
        ${h1('Payment is now 7 days overdue')}
        ${p(`Hi ${iv.clientName}, this is our second reminder regarding invoice <strong>${iv.invoiceNumber}</strong>. The amount of <strong>${iv.total}</strong> was due on ${iv.dueDate} and remains unpaid.`)}
        ${p('We would appreciate your prompt attention to this matter. If there is an issue with the invoice or you need to discuss payment arrangements, please reply to this email.')}
        ${amountBlock(iv.total, 'Overdue amount')}
        ${infoCard([
          ['Invoice',    iv.invoiceNumber],
          ['Was due',    iv.dueDate],
          ['Overdue by', `${iv.overdueByDays} days`],
        ])}
        ${iv.paymentLink ? btn('Pay Now', iv.paymentLink, '#F59E0B') : btn('View Invoice', iv.viewUrl)}
        ${divider()}
        ${p('If payment has already been made, please disregard this notice.', true)}
      `, iv.businessName, `Second notice: ${iv.invoiceNumber} is 7 days overdue`)
    },
  },

  // ── Invoice: overdue D+14 (final notice) ────────────────────────────────────
  invoice_reminder_d14: {
    subject: (v) => {
      const iv = v as InvoiceTemplateVars
      return `Final notice: ${iv.invoiceNumber} — 14 days overdue — ${iv.businessName}`
    },
    html: (v) => {
      const iv = v as InvoiceTemplateVars
      return layout(`
        ${alert('Final notice — immediate action required', 'error')}
        ${subheading('Final Payment Notice')}
        ${h1('Immediate payment required')}
        ${p(`Hi ${iv.clientName}, this is our final notice for invoice <strong>${iv.invoiceNumber}</strong>. The payment of <strong>${iv.total}</strong> is now 14 days overdue.`)}
        ${p('We request that you settle this invoice immediately. Continued non-payment may affect our ability to work together in the future. If you are experiencing difficulties, please contact us now to discuss a resolution.')}
        ${amountBlock(iv.total, 'Amount overdue')}
        ${infoCard([
          ['Invoice',    iv.invoiceNumber],
          ['Was due',    iv.dueDate],
          ['Overdue by', `${iv.overdueByDays} days`],
        ])}
        ${iv.paymentLink ? btn('Pay Now — Settle Immediately', iv.paymentLink, '#EF4444') : btn('View Invoice', iv.viewUrl)}
      `, iv.businessName, `Final notice: ${iv.invoiceNumber} is 14 days overdue`)
    },
  },

  // ── Invoice: payment confirmed ───────────────────────────────────────────────
  invoice_paid_thanks: {
    subject: (v) => {
      const iv = v as InvoiceTemplateVars
      return `Payment received — thank you! (${iv.invoiceNumber})`
    },
    html: (v) => {
      const iv = v as InvoiceTemplateVars
      return layout(`
        ${alert('Payment received successfully', 'success')}
        ${subheading('Payment Confirmed')}
        ${h1('Thank you for your payment!')}
        ${p(`Hi ${iv.clientName}, we have received your payment of <strong>${iv.total}</strong> for invoice <strong>${iv.invoiceNumber}</strong>. Your account is all settled.`)}
        ${amountBlock(iv.total, 'Amount received')}
        ${infoCard([
          ['Invoice',  iv.invoiceNumber],
          ['Amount',   iv.total],
          ['Status',   'Paid ✓'],
        ])}
        ${btn('Download Receipt', iv.viewUrl, '#16A34A')}
        ${divider()}
        ${p('It has been a pleasure working with you. We look forward to our next project together!', true)}
      `, iv.businessName, `Payment of ${iv.total} received for ${iv.invoiceNumber}`)
    },
  },

  // ── Proposal: sent to client ─────────────────────────────────────────────────
  proposal_client_link: {
    subject: (v) => {
      const pv = v as ProposalTemplateVars
      return `${pv.businessName} has sent you a proposal`
    },
    html: (v) => {
      const pv = v as ProposalTemplateVars
      return layout(`
        ${subheading('New Proposal')}
        ${h1(`A proposal from ${pv.businessName}`)}
        ${p(`Hi ${pv.clientName}, ${pv.businessName} has prepared a detailed proposal for you. It includes scope of work, pricing, timeline, and terms — all in one place.`)}
        ${p('You can review and accept it directly from the link below. The whole process takes less than 2 minutes.')}
        ${infoCard([
          ['Proposal',    pv.proposalTitle],
          ...(pv.validUntil && pv.validUntil !== '—' ? [['Valid until', pv.validUntil] as [string, string]] : []),
          ['From',        pv.businessName],
        ])}
        ${btn('View Proposal', pv.proposalLink, '#4F46E5')}
        ${divider()}
        ${p('You can accept or decline the proposal from the link above. If you have questions or need changes, simply reply to this email.', true)}
      `, pv.businessName, `New proposal from ${pv.businessName}: ${pv.proposalTitle}`)
    },
  },

  // ── Proposal: expiring tomorrow ──────────────────────────────────────────────
  proposal_expiry_notice: {
    subject: (v) => {
      const pv = v as ProposalTemplateVars
      return `Your proposal from ${pv.businessName} expires tomorrow`
    },
    html: (v) => {
      const pv = v as ProposalTemplateVars
      return layout(`
        ${alert('This proposal expires tomorrow', 'warning')}
        ${subheading('Proposal Expiring Soon')}
        ${h1('Last chance to accept this proposal')}
        ${p(`Hi ${pv.clientName}, just a reminder that the proposal <strong>"${pv.proposalTitle}"</strong> from ${pv.businessName} expires on <strong>${pv.validUntil}</strong>.`)}
        ${p('If you are ready to move forward, you can accept it directly from the link below. If you need more time or have questions, please reply to this email.')}
        ${infoCard([
          ['Proposal',   pv.proposalTitle],
          ['Expires',    pv.validUntil ?? '—'],
        ])}
        ${btn('View & Accept Proposal', pv.proposalLink, '#4F46E5')}
      `, pv.businessName, `Proposal "${pv.proposalTitle}" expires on ${pv.validUntil}`)
    },
  },

  // ── Proposal: not opened alert (to USER) ─────────────────────────────────────
  proposal_not_opened_alert: {
    subject: (v) => {
      const pv = v as ProposalTemplateVars
      return `Follow-up: ${pv.clientName} hasn't opened your proposal yet`
    },
    html: (v) => {
      const pv = v as ProposalTemplateVars
      return layout(`
        ${alert('Proposal sent 3 days ago — not yet opened', 'warning')}
        ${subheading('Action Recommended')}
        ${h1(`${pv.clientName} hasn't opened your proposal`)}
        ${p(`Your proposal <strong>"${pv.proposalTitle}"</strong> was sent to ${pv.clientName} 3 days ago but has not been opened yet.`)}
        ${p('This is a good time to follow up directly — a quick call or WhatsApp message often helps move things forward while you are still top of mind.')}
        ${btn('View Proposal', pv.proposalLink)}
        ${divider()}
        ${p('Tip: A quick "just checking in" message via WhatsApp has a 98% open rate.', true)}
      `, pv.businessName)
    },
  },

  // ── Proposal: viewed but no response (to USER) ───────────────────────────────
  proposal_viewed_alert: {
    subject: (v) => {
      const pv = v as ProposalTemplateVars
      return `${pv.clientName} viewed your proposal — follow up now`
    },
    html: (v) => {
      const pv = v as ProposalTemplateVars
      return layout(`
        ${alert('Client viewed proposal 2 days ago — no response yet', 'info')}
        ${subheading('Follow-up Suggested')}
        ${h1('They looked — time to nudge')}
        ${p(`${pv.clientName} opened your proposal <strong>"${pv.proposalTitle}"</strong> but has not accepted or replied in the last 2 days.`)}
        ${p('This is the best moment to follow up. They have clearly shown interest — a short, friendly check-in can be the difference between winning and losing this project.')}
        ${btn('View Proposal', pv.proposalLink)}
      `, pv.businessName)
    },
  },

  // ── Contract: sent to client ─────────────────────────────────────────────────
  contract_client_sign: {
    subject: (v) => {
      const cv = v as ContractTemplateVars
      return `Please sign your contract — ${cv.businessName}`
    },
    html: (v) => {
      const cv = v as ContractTemplateVars
      return layout(`
        ${subheading('Contract Ready to Sign')}
        ${h1('Your contract is waiting')}
        ${p(`Hi ${cv.clientName}, ${cv.businessName} has sent you a contract for your review and signature. Please take a moment to read through it carefully.`)}
        ${infoCard([
          ['Contract', cv.contractTitle],
          ['From',     cv.businessName],
          ['Method',   'OTP e-signature (IT Act 2000)'],
        ])}
        ${btn('Review & Sign Contract', cv.signLink, '#4F46E5')}
        ${divider()}
        ${p('Signing takes less than a minute. You will receive a one-time code to your email to confirm your identity and complete the process securely.', true)}
        ${p('If you need any changes before signing or have questions, simply reply to this email.', true)}
      `, cv.businessName, `Contract "${cv.contractTitle}" from ${cv.businessName} is ready for your signature`)
    },
  },

  // ── Contract: not signed D+3 (to CLIENT) ────────────────────────────────────
  contract_reminder_d3: {
    subject: (v) => {
      const cv = v as ContractTemplateVars
      return `Reminder: Your contract from ${cv.businessName} is awaiting your signature`
    },
    html: (v) => {
      const cv = v as ContractTemplateVars
      return layout(`
        ${alert('Contract unsigned — sent 3 days ago', 'info')}
        ${subheading('Signature Reminder')}
        ${h1('Your contract is still waiting')}
        ${p(`Hi ${cv.clientName}, we sent you a contract <strong>"${cv.contractTitle}"</strong> a few days ago. It is ready for your e-signature and the process takes less than a minute.`)}
        ${infoCard([
          ['Contract', cv.contractTitle],
          ['From',     cv.businessName],
        ])}
        ${btn('Sign Contract Now', cv.signLink, '#4F46E5')}
        ${divider()}
        ${p('If you have concerns or would like to discuss any terms before signing, just reply to this email.', true)}
      `, cv.businessName)
    },
  },

  // ── Contract: not signed D+7 (to CLIENT) ────────────────────────────────────
  contract_reminder_d7: {
    subject: (v) => {
      const cv = v as ContractTemplateVars
      return `Second reminder: "${cv.contractTitle}" still awaiting your signature`
    },
    html: (v) => {
      const cv = v as ContractTemplateVars
      return layout(`
        ${alert('Contract unsigned for 7 days', 'warning')}
        ${subheading('Second Signature Reminder')}
        ${h1('Still waiting on your signature')}
        ${p(`Hi ${cv.clientName}, this is a follow-up regarding the contract <strong>"${cv.contractTitle}"</strong> from ${cv.businessName}. It has been 7 days and the contract is still awaiting your signature.`)}
        ${p('We would love to get started on the project — signing takes less than a minute. Could you please take a moment to review and sign?')}
        ${infoCard([
          ['Contract', cv.contractTitle],
          ['From',     cv.businessName],
        ])}
        ${btn('Sign Contract Now', cv.signLink, '#4F46E5')}
      `, cv.businessName)
    },
  },

  // ── Lead: cold alert (to USER) ───────────────────────────────────────────────
  lead_cold_alert: {
    subject: (v) => {
      const lv = v as LeadTemplateVars
      return `Lead going cold: ${lv.leadName} — no activity for ${lv.lastActivityDays} days`
    },
    html: (v) => {
      const lv = v as LeadTemplateVars
      return layout(`
        ${alert(`No activity for ${lv.lastActivityDays} days`, 'warning')}
        ${subheading('Lead Alert')}
        ${h1('A lead is going cold')}
        ${p(`<strong>${lv.leadName}</strong>${lv.service ? ` — ${lv.service}` : ''} has had no activity for <strong>${lv.lastActivityDays} days</strong>.`)}
        ${p('Leads that go cold are significantly harder to close. Reaching out today, while the conversation is still somewhat warm, gives you the best chance of reviving this opportunity.')}
        ${divider()}
        ${p('Tip: A short, no-pressure message often works best — "Hey, just checking in on that proposal we discussed."', true)}
      `, lv.businessName)
    },
  },

  // ── Lead: new enquiry auto-reply (to LEAD) ───────────────────────────────────
  lead_new_enquiry: {
    subject: (v) => {
      const lv = v as LeadTemplateVars
      return `We received your enquiry — ${lv.businessName}`
    },
    html: (v) => {
      const lv = v as LeadTemplateVars
      return layout(`
        ${subheading('Enquiry Received')}
        ${h1(`Thanks for reaching out, ${lv.leadName}!`)}
        ${p(`We have received your enquiry${lv.service ? ` about <strong>${lv.service}</strong>` : ''} and will get back to you shortly.`)}
        ${p('We typically respond within 1 business day. In the meantime, feel free to reply to this email with any additional details that might help us prepare better for you.')}
        ${divider()}
        ${p(`Looking forward to connecting — the ${lv.businessName} team.`, true)}
      `, lv.businessName, `Your enquiry has been received by ${lv.businessName}`)
    },
  },

  // ── Meeting: confirmed (to CLIENT) ───────────────────────────────────────────
  meeting_scheduled_client: {
    subject: (v) => {
      const mv = v as MeetingTemplateVars
      return `Meeting confirmed: "${mv.meetingTitle}" on ${mv.scheduledAt}`
    },
    html: (v) => {
      const mv = v as MeetingTemplateVars
      const duration = mv.durationMins >= 60
        ? `${mv.durationMins / 60} hour${mv.durationMins > 60 ? 's' : ''}`
        : `${mv.durationMins} minutes`
      return layout(`
        ${alert('Your meeting is confirmed', 'success')}
        ${subheading('Meeting Scheduled')}
        ${h1(`You have a call with ${mv.businessName}`)}
        ${p(`Hi ${mv.recipientName}, your meeting has been confirmed. Here are the details:`)}
        ${infoCard([
          ['Meeting',    mv.meetingTitle],
          ['Date & Time', mv.scheduledAt],
          ['Duration',   duration],
          ...(mv.agenda ? [['Agenda', mv.agenda] as [string, string]] : []),
        ])}
        ${mv.meetLink ? btn('Join Google Meet', mv.meetLink, '#059669') : ''}
        ${mv.portalLink ? p(`All your documents and this meeting are also available in your <a href="${mv.portalLink}" style="color:#4F46E5;font-weight:600;text-decoration:none;">client portal</a>.`, true) : ''}
        ${divider()}
        ${p('Need to reschedule or have questions? Simply reply to this email.', true)}
      `, mv.businessName, `Meeting "${mv.meetingTitle}" confirmed on ${mv.scheduledAt}`)
    },
  },

  // ── Meeting: reminder 1 hour before ──────────────────────────────────────────
  meeting_reminder: {
    subject: (v) => {
      const mv = v as MeetingTemplateVars
      return `Starting in 1 hour: "${mv.meetingTitle}"`
    },
    html: (v) => {
      const mv = v as MeetingTemplateVars
      return layout(`
        ${alert('Your call starts in 1 hour', 'info')}
        ${subheading('Meeting Reminder')}
        ${h1('Your call is almost here')}
        ${p(`Hi ${mv.recipientName}, this is a reminder for your upcoming meeting with ${mv.businessName}.`)}
        ${infoCard([
          ['Meeting',  mv.meetingTitle],
          ['Time',     mv.scheduledAt],
          ['Duration', `${mv.durationMins} minutes`],
          ...(mv.agenda ? [['Agenda', mv.agenda] as [string, string]] : []),
        ])}
        ${mv.meetLink
          ? btn('Join Google Meet Now', mv.meetLink, '#059669')
          : alert('No video link found — please contact the organiser for joining details.', 'warning')
        }
      `, mv.businessName, `Reminder: "${mv.meetingTitle}" starts in 1 hour`)
    },
  },

  // ── GST filing reminder (to USER) ────────────────────────────────────────────
  gst_reminder: {
    subject: (v) => {
      const dv = v as DigestTemplateVars
      return `GST Reminder: GSTR-1 due soon — ${dv.businessName}`
    },
    html: (v) => {
      const dv = v as DigestTemplateVars
      return layout(`
        ${alert('GSTR-1 is due by the 11th of this month', 'warning')}
        ${subheading('GST Filing Reminder')}
        ${h1('Time to file your GST return')}
        ${p(`Your monthly GSTR-1 filing is due by the <strong>11th of this month</strong>. File early to avoid late fees and interest charges.`)}
        ${infoCard([
          ['Revenue this month', dv.revenueThisMonth],
          ['Active leads',       String(dv.activeLeads)],
          ['Overdue invoices',   String(dv.overdueCount)],
        ])}
        ${divider()}
        ${p('Log in to the <a href="https://gst.gov.in" style="color:#4F46E5;font-weight:600;text-decoration:none;">GST portal</a> or share this summary with your CA to file on time.', true)}
      `, dv.businessName)
    },
  },

  // ── Weekly digest (to USER) ───────────────────────────────────────────────────
  weekly_digest: {
    subject: (v) => {
      const dv = v as DigestTemplateVars
      return `Your weekly snapshot — ${dv.businessName}`
    },
    html: (v) => {
      const dv = v as DigestTemplateVars
      return layout(`
        ${subheading('Weekly Business Snapshot')}
        ${h1('Here is how your week looks')}
        ${infoCard([
          ['Revenue this month', dv.revenueThisMonth],
          ['Active leads',       String(dv.activeLeads)],
          ['Open proposals',     String(dv.openProposals)],
          ['Overdue invoices',   String(dv.overdueCount)],
          ['Follow-ups due',     String(dv.followUpsCount)],
        ])}
        ${dv.overdueCount > 0
          ? alert(`${dv.overdueCount} overdue invoice${dv.overdueCount > 1 ? 's' : ''} need your attention — chase them up today.`, 'error')
          : alert('No overdue invoices — great work!', 'success')
        }
        ${dv.followUpsCount > 0
          ? alert(`${dv.followUpsCount} follow-up${dv.followUpsCount > 1 ? 's' : ''} scheduled this week`, 'warning')
          : ''}
        ${divider()}
        ${p('Log in to Clinekt to see detailed breakdowns and manage your pipeline.', true)}
      `, dv.businessName, `Your weekly business snapshot for ${dv.businessName}`)
    },
  },

  // ── Monthly summary (to USER) ─────────────────────────────────────────────────
  monthly_summary: {
    subject: (v) => {
      const dv = v as DigestTemplateVars
      return `Monthly summary: ${new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })} — ${dv.businessName}`
    },
    html: (v) => {
      const dv = v as DigestTemplateVars
      return layout(`
        ${subheading('Monthly Business Summary')}
        ${h1(`${new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })} at a glance`)}
        ${p(`Here is how ${dv.businessName} performed this month:`)}
        ${infoCard([
          ['Revenue collected', dv.revenueThisMonth],
          ['Active leads',      String(dv.activeLeads)],
          ['Open proposals',    String(dv.openProposals)],
          ['Overdue invoices',  String(dv.overdueCount)],
        ])}
        ${dv.overdueCount > 0
          ? alert(`${dv.overdueCount} invoice${dv.overdueCount > 1 ? 's' : ''} overdue — consider sending reminders.`, 'warning')
          : alert('All invoices settled — excellent month!', 'success')
        }
        ${divider()}
        ${p('Log in to Clinekt for detailed reporting, upcoming follow-ups, and your full pipeline view.', true)}
      `, dv.businessName, `Monthly summary for ${dv.businessName}`)
    },
  },

}

// ─── Renderer ─────────────────────────────────────────────────────────────────

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

// ─── Handlebars-style substitution for user-saved DB templates ────────────────
// Replaces {{variableName}} with values from the vars object

export function substituteVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

// ─── Render a user-customised DB template ─────────────────────────────────────

export function renderCustomTemplate(
  subjectTpl: string,
  bodyTpl: string,
  vars: Record<string, string>,
  businessName: string,
): { subject: string; html: string } {
  const subject = substituteVars(subjectTpl, vars)
  const body    = substituteVars(bodyTpl, vars)
  return {
    subject,
    html: layout(body, businessName),
  }
}

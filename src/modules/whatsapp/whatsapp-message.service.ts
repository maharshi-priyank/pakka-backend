import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { WhatsappConnectionService } from './whatsapp-connection.service'

interface TemplateComponent {
  type:       string
  parameters: Array<{ type: string; text: string }>
}

interface TemplateSpec {
  name:       string
  components: TemplateComponent[]
}

// Maps internal template keys → Meta-approved template names + component builders.
// Template names must match exactly what was submitted to Meta for approval.
// TODO(WhatsApp): Replace placeholder template names with the actual approved names
// once Meta template submissions are approved (submit via Meta Business Manager).
const TEMPLATE_MAP: Record<string, (vars: Record<string, string>) => TemplateSpec> = {
  wa_proposal_shared: (v) => ({
    name: 'clearwork_proposal_shared',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: v.clientName    ?? '' },
        { type: 'text', text: v.businessName  ?? '' },
        { type: 'text', text: v.proposalLink  ?? '' },
      ],
    }],
  }),
  wa_contract_sent: (v) => ({
    name: 'clearwork_contract_sent',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: v.clientName   ?? '' },
        { type: 'text', text: v.businessName ?? '' },
        { type: 'text', text: v.contractLink ?? '' },
      ],
    }],
  }),
  wa_contract_signed: (v) => ({
    name: 'clearwork_contract_signed',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: v.clientName   ?? '' },
        { type: 'text', text: v.businessName ?? '' },
        { type: 'text', text: v.contractLink ?? '' },
      ],
    }],
  }),
  wa_invoice_sent: (v) => ({
    name: 'clearwork_invoice_sent',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: v.clientName     ?? '' },
        { type: 'text', text: v.businessName   ?? '' },
        { type: 'text', text: v.invoiceNumber  ?? '' },
        { type: 'text', text: v.amount         ?? '' },
        { type: 'text', text: v.invoiceLink    ?? '' },
      ],
    }],
  }),
  wa_payment_reminder: (v) => ({
    name: 'clearwork_payment_reminder',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: v.clientName    ?? '' },
        { type: 'text', text: v.invoiceNumber ?? '' },
        { type: 'text', text: v.amount        ?? '' },
        { type: 'text', text: v.dueDate       ?? '' },
        { type: 'text', text: v.invoiceLink   ?? '' },
      ],
    }],
  }),
  wa_payment_received: (v) => ({
    name: 'clearwork_payment_received',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: v.clientName    ?? '' },
        { type: 'text', text: v.businessName  ?? '' },
        { type: 'text', text: v.invoiceNumber ?? '' },
        { type: 'text', text: v.amount        ?? '' },
      ],
    }],
  }),
  wa_project_completed: (v) => ({
    name: 'clearwork_project_completed',
    components: [{
      type: 'body',
      parameters: [
        { type: 'text', text: v.clientName   ?? '' },
        { type: 'text', text: v.businessName ?? '' },
        { type: 'text', text: v.projectName  ?? '' },
      ],
    }],
  }),
}

const RETRY_DELAYS_MS = [1000, 4000, 16000]

@Injectable()
export class WhatsappMessageService {
  private readonly logger = new Logger(WhatsappMessageService.name)

  constructor(
    private readonly prisma:      PrismaService,
    private readonly connection:  WhatsappConnectionService,
  ) {}

  async sendTemplateMessage(
    workspaceId: string,
    phone:       string,
    templateKey: string,
    vars:        Record<string, string>,
    entityId?:   string,
    entityType?: string,
    contactId?:  string,
  ): Promise<void> {
    // Phone guard — callers should check, but double-check here
    if (!phone) {
      await this.log({ workspaceId, contactId, to: '', templateKey, entityId, entityType, status: 'skipped', error: 'no phone number' })
      return
    }

    // Connection guard
    let decrypted: Awaited<ReturnType<WhatsappConnectionService['getDecryptedToken']>>
    try {
      decrypted = await this.connection.getDecryptedToken(workspaceId)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await this.log({ workspaceId, contactId, to: phone, templateKey, entityId, entityType, status: 'failed', error: msg })
      return
    }

    const templateBuilder = TEMPLATE_MAP[templateKey]
    if (!templateBuilder) {
      await this.log({ workspaceId, contactId, to: phone, templateKey, entityId, entityType, status: 'failed', error: `Unknown template key: ${templateKey}` })
      return
    }

    const template = templateBuilder(vars)

    // TODO(WhatsApp): Uncomment the Meta Cloud API call below once:
    //   1. ClearWork Meta App is registered and approved
    //   2. The 7 message templates have been submitted and approved in Meta Business Manager
    //   3. WHATSAPP_APP_SECRET env var is set (for webhook verification in whatsapp-webhook.controller.ts)
    //
    // The retry logic, logging, and template structure below are production-ready.
    // Only the actual HTTP call needs to be uncommented.
    //
    // --- UNCOMMENT START ---
    // const payload = {
    //   messaging_product: 'whatsapp',
    //   to:                phone,
    //   type:              'template',
    //   template: {
    //     name:       template.name,
    //     language:   { code: 'en' },
    //     components: template.components,
    //   },
    // }
    //
    // let lastError = ''
    // for (let attempt = 0; attempt < 3; attempt++) {
    //   try {
    //     const res = await fetch(
    //       `https://graph.facebook.com/v19.0/${decrypted.phoneNumberId}/messages`,
    //       {
    //         method:  'POST',
    //         headers: {
    //           'Authorization': `Bearer ${decrypted.token}`,
    //           'Content-Type':  'application/json',
    //         },
    //         body: JSON.stringify(payload),
    //       },
    //     )
    //     const data = await res.json() as { messages?: Array<{ id: string }>; error?: { message: string; code: number } }
    //
    //     if (res.ok && data.messages?.[0]?.id) {
    //       await this.log({ workspaceId, contactId, to: phone, templateKey, entityId, entityType, status: 'sent', waMessageId: data.messages[0].id })
    //       this.logger.log(`[wa-sent] workspace=${workspaceId} phone=${phone} template=${templateKey} wamid=${data.messages[0].id}`)
    //       return
    //     }
    //
    //     const errMsg = data.error?.message ?? `HTTP ${res.status}`
    //     // 4xx = permanent failure, do not retry
    //     if (res.status >= 400 && res.status < 500) {
    //       await this.log({ workspaceId, contactId, to: phone, templateKey, entityId, entityType, status: 'failed', error: errMsg })
    //       return
    //     }
    //     // 5xx = transient, retry
    //     lastError = errMsg
    //   } catch (err) {
    //     lastError = err instanceof Error ? err.message : String(err)
    //   }
    //
    //   if (attempt < 2) await this.sleep(RETRY_DELAYS_MS[attempt])
    // }
    //
    // await this.log({ workspaceId, contactId, to: phone, templateKey, entityId, entityType, status: 'failed', error: `3 retries exhausted: ${lastError}` })
    // this.logger.error(`[wa-failed] workspace=${workspaceId} phone=${phone} template=${templateKey} error=${lastError}`)
    // --- UNCOMMENT END ---

    // Temporary stub: log as skipped until Meta App is configured
    this.logger.debug(`[wa-skip-meta-not-configured] workspace=${workspaceId} phone=${phone} template=${templateKey}`)
    await this.log({ workspaceId, contactId, to: phone, templateKey, entityId, entityType, status: 'skipped', error: 'Meta App not yet configured — uncomment API call in whatsapp-message.service.ts' })
  }

  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  private async log(opts: {
    workspaceId: string
    contactId?:  string
    to:          string
    templateKey: string
    entityId?:   string
    entityType?: string
    status:      string
    error?:      string
    waMessageId?: string
  }) {
    try {
      await this.prisma.communicationLog.create({
        data: {
          workspaceId: opts.workspaceId,
          contactId:   opts.contactId,
          channel:     'WHATSAPP',
          to:          opts.to,
          subject:     `WhatsApp: ${opts.templateKey}`,
          templateKey: opts.templateKey,
          entityId:    opts.entityId,
          entityType:  opts.entityType,
          status:      opts.status,
          error:       opts.error,
          waMessageId: opts.waMessageId,
        },
      })
    } catch (err) {
      this.logger.error(`[wa-log-fail] ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

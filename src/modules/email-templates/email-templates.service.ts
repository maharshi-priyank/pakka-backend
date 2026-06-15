import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { EmailService } from '../automations/email.service'
import {
  EMAIL_TEMPLATES,
  renderTemplate,
  renderCustomTemplate,
  layout,
} from '../automations/templates/email-templates'
import { TEMPLATE_REGISTRY, TEMPLATE_KEYS, getTemplateMeta } from './template-vars.registry'
import type { UpsertEmailTemplateDto } from './dto/upsert-email-template.dto'
import type { SendTestEmailDto } from './dto/send-test-email.dto'

@Injectable()
export class EmailTemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  /** All template metadata + whether the user has customised each one */
  async listTemplates(workspaceId: string) {
    const overrides = await this.prisma.emailTemplate.findMany({
      where: { workspaceId },
      select: { templateKey: true, subject: true, updatedAt: true },
    })
    const overrideMap = new Map(overrides.map(o => [o.templateKey, o]))

    return TEMPLATE_REGISTRY.map(meta => ({
      ...meta,
      isCustomised: overrideMap.has(meta.key),
      customisedAt: overrideMap.get(meta.key)?.updatedAt ?? null,
    }))
  }

  /** Get one template — returns DB override if it exists, else renders system default as HTML */
  async getTemplate(workspaceId: string, templateKey: string) {
    if (!TEMPLATE_KEYS.includes(templateKey)) {
      throw new NotFoundException(`Unknown template key: ${templateKey}`)
    }

    const meta = getTemplateMeta(templateKey)!

    const override = await this.prisma.emailTemplate.findUnique({
      where: { workspaceId_templateKey: { workspaceId, templateKey } },
    })

    if (override) {
      return {
        templateKey,
        meta,
        isCustomised: true,
        subject: override.subject,
        bodyHtml: override.bodyHtml,
        updatedAt: override.updatedAt,
      }
    }

    // Build a sample render of the system default so the editor shows real preview
    const sampleVars = this.buildSampleVars(templateKey)
    const { subject, html } = renderTemplate(templateKey, sampleVars as any)

    return {
      templateKey,
      meta,
      isCustomised: false,
      subject,
      bodyHtml: html,
      updatedAt: null,
    }
  }

  /** Save or update a user-customised template */
  async upsertTemplate(workspaceId: string, templateKey: string, dto: UpsertEmailTemplateDto) {
    if (!TEMPLATE_KEYS.includes(templateKey)) {
      throw new NotFoundException(`Unknown template key: ${templateKey}`)
    }

    const record = await this.prisma.emailTemplate.upsert({
      where:  { workspaceId_templateKey: { workspaceId, templateKey } },
      create: { workspaceId, templateKey, subject: dto.subject, bodyHtml: dto.bodyHtml },
      update: { subject: dto.subject, bodyHtml: dto.bodyHtml },
    })
    return record
  }

  /** Reset a template back to system default */
  async resetTemplate(workspaceId: string, templateKey: string) {
    await this.prisma.emailTemplate.deleteMany({
      where: { workspaceId, templateKey },
    })
    return { reset: true }
  }

  /** Send a test email using sample vars to the given address */
  async sendTestEmail(workspaceId: string, dto: SendTestEmailDto) {
    const { templateKey, to } = dto
    if (!TEMPLATE_KEYS.includes(templateKey)) {
      throw new NotFoundException(`Unknown template key: ${templateKey}`)
    }

    const user = await this.prisma.user.findUnique({
      where: { id: workspaceId },
      select: { email: true, businessName: true },
    })
    if (!user) throw new NotFoundException('User not found')

    const override = await this.prisma.emailTemplate.findUnique({
      where: { workspaceId_templateKey: { workspaceId, templateKey } },
    })

    let subject: string
    let html: string

    if (override) {
      const sampleVars = this.buildSampleVarsRecord(templateKey)
      const rendered = renderCustomTemplate(
        override.subject,
        override.bodyHtml,
        sampleVars,
        user.businessName ?? 'Your Business',
      )
      subject = rendered.subject
      html    = rendered.html
    } else {
      const sampleVars = this.buildSampleVars(templateKey)
      const rendered = renderTemplate(templateKey, sampleVars as any)
      subject = `[TEST] ${rendered.subject}`
      html    = rendered.html
    }

    await this.emailService.send({
      workspaceId,
      to,
      subject: `[TEST] ${subject}`,
      html,
      templateKey,
    })

    return { sent: true, to }
  }

  /** Preview template HTML with sample data (no email sent) */
  async previewTemplate(workspaceId: string, templateKey: string) {
    if (!TEMPLATE_KEYS.includes(templateKey)) {
      throw new NotFoundException(`Unknown template key: ${templateKey}`)
    }

    const user = await this.prisma.user.findUnique({
      where: { id: workspaceId },
      select: { businessName: true },
    })
    const businessName = user?.businessName ?? 'Your Business'

    const override = await this.prisma.emailTemplate.findUnique({
      where: { workspaceId_templateKey: { workspaceId, templateKey } },
    })

    if (override) {
      const sampleVars = this.buildSampleVarsRecord(templateKey)
      const { subject, html } = renderCustomTemplate(
        override.subject,
        override.bodyHtml,
        sampleVars,
        businessName,
      )
      return { subject, html }
    }

    const sampleVars = this.buildSampleVars(templateKey)
    return renderTemplate(templateKey, sampleVars as any)
  }

  // Build sample TemplateVars-compatible object from registry sample values
  private buildSampleVars(templateKey: string): Record<string, unknown> {
    const meta = getTemplateMeta(templateKey)
    if (!meta) return {}
    const out: Record<string, unknown> = {}
    for (const v of meta.vars) {
      out[v.name] = v.sample
    }
    // Ensure businessName is always present
    if (!out['businessName']) out['businessName'] = 'Studio Rao'
    return out
  }

  // Build flat Record<string, string> for substituteVars
  private buildSampleVarsRecord(templateKey: string): Record<string, string> {
    const meta = getTemplateMeta(templateKey)
    if (!meta) return {}
    const out: Record<string, string> = {}
    for (const v of meta.vars) {
      out[v.name] = v.sample
    }
    if (!out['businessName']) out['businessName'] = 'Studio Rao'
    return out
  }
}

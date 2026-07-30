import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'
import { PrismaService } from '../../prisma/prisma.service'

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name)
  private transporter: nodemailer.Transporter | null = null

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const user = this.config.get<string>('email.user')
    const pass = this.config.get<string>('email.pass')

    if (user && pass) {
      const port = this.config.get<number>('email.port') ?? 587
      this.transporter = nodemailer.createTransport({
        host:   this.config.get<string>('email.host'),
        port,
        secure: port === 465,
        auth:   { user, pass },
      })
    } else {
      this.logger.warn('EMAIL_USER/EMAIL_PASS not configured — emails will be skipped')
    }
  }

  async send(opts: {
    workspaceId: string
    to:          string
    subject:     string
    html:        string
    templateKey: string
    entityId?:   string
    entityType?: string
  }): Promise<boolean> {
    const defaultFrom = this.config.get<string>('email.from') ?? 'ClearWork <noreply@clearwork.in>'

    // Every automated email sent to a client is on behalf of the freelancer's
    // business, not ClearWork. We can't send FROM the freelancer's own address
    // (breaks SPF/DKIM on a shared relay, gets flagged as spoofing) — so we
    // show their business name in the From header and set Reply-To to their
    // own inbox, so replies land with them, not in a noreply@ black hole.
    const owner = await this.prisma.user.findUnique({
      where:  { id: opts.workspaceId },
      select: { email: true, businessName: true, name: true },
    })
    const businessName = owner?.businessName ?? owner?.name
    const fromAddress   = defaultFrom.match(/<(.+)>/)?.[1] ?? defaultFrom
    const from    = businessName ? `${businessName} via ClearWork <${fromAddress}>` : defaultFrom
    const replyTo = owner?.email

    if (!this.transporter) {
      this.logger.debug(`[email-skip] to=${opts.to} subject="${opts.subject}"`)
      await this.log({ ...opts, status: 'skipped', error: 'transporter not configured' })
      return false
    }

    try {
      await this.transporter.sendMail({ from, to: opts.to, subject: opts.subject, html: opts.html, replyTo })
      await this.log({ ...opts, status: 'sent' })
      this.logger.log(`[email-sent] to=${opts.to} template=${opts.templateKey}`)
      return true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      await this.log({ ...opts, status: 'failed', error: msg })
      this.logger.error(`[email-failed] to=${opts.to} error=${msg}`)
      return false
    }
  }

  private async log(opts: {
    workspaceId: string
    to:          string
    subject:     string
    templateKey: string
    entityId?:   string
    entityType?: string
    status:      string
    error?:      string
  }) {
    await this.prisma.emailLog.create({
      data: {
        workspaceId: opts.workspaceId,
        to:          opts.to,
        subject:     opts.subject,
        templateKey: opts.templateKey,
        entityId:    opts.entityId,
        entityType:  opts.entityType,
        status:      opts.status,
        error:       opts.error,
      },
    })
  }
}

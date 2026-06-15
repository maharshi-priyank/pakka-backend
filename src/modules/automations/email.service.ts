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
    userId:      string
    to:          string
    subject:     string
    html:        string
    templateKey: string
    entityId?:   string
    entityType?: string
  }): Promise<boolean> {
    const from = this.config.get<string>('email.from') ?? 'ClearWork <noreply@clearwork.in>'

    if (!this.transporter) {
      this.logger.debug(`[email-skip] to=${opts.to} subject="${opts.subject}"`)
      await this.log({ ...opts, status: 'skipped', error: 'transporter not configured' })
      return false
    }

    try {
      await this.transporter.sendMail({ from, to: opts.to, subject: opts.subject, html: opts.html })
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
    userId:      string
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
        workspaceId: opts.userId,
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

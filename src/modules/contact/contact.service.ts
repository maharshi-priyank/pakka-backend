import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'
import { ContactDto } from './contact.dto'

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name)
  private transporter: nodemailer.Transporter | null = null

  constructor(private readonly config: ConfigService) {
    const user = this.config.get<string>('email.user')
    const pass = this.config.get<string>('email.pass')
    if (user && pass) {
      const port = this.config.get<number>('email.port') ?? 587
      this.transporter = nodemailer.createTransport({
        host: this.config.get<string>('email.host'),
        port,
        secure: port === 465,
        auth: { user, pass },
      })
    } else {
      this.logger.warn('EMAIL_USER/EMAIL_PASS not set — contact emails will be skipped')
    }
  }

  async send(dto: ContactDto): Promise<void> {
    const to = 'hello@getclearwork.in'
    const from = this.config.get<string>('email.from') ?? 'ClearWork <noreply@getclearwork.in>'
    const subject = `[ClearWork Contact] ${dto.category} — ${dto.name}`
    const text = [
      `Name:     ${dto.name}`,
      `Email:    ${dto.email}`,
      `Category: ${dto.category}`,
      ``,
      `Message:`,
      dto.message,
    ].join('\n')

    if (!this.transporter) {
      this.logger.debug(`[contact-skip] from=${dto.email} subject="${subject}"`)
      return
    }

    try {
      await this.transporter.sendMail({ from, to, replyTo: dto.email, subject, text })
      this.logger.log(`[contact-sent] from=${dto.email}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`[contact-failed] error=${msg}`)
      throw new InternalServerErrorException('Failed to send message')
    }
  }
}

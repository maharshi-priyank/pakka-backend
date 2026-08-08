import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { EmailService } from '../automations/email.service'
import * as bcrypt from 'bcrypt'

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly email:  EmailService,
  ) {}

  // Generate a 6-digit OTP, hash it, store on the entity, and auto-email it.
  // Returns { otpEmailSent: boolean }.
  async generate(
    entityType: 'contract' | 'approvalRequest',
    entityId:   string,
    recipient:  { email: string; name: string; workspaceId: string },
  ): Promise<{ otpEmailSent: boolean }> {
    const code        = this.generateCode()
    const otpHash     = await bcrypt.hash(code, 10)
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000)

    // Persist hash + expiry + reset failed count + record lastSentAt
    if (entityType === 'contract') {
      await this.prisma.contract.update({
        where: { id: entityId },
        data:  { otpHash, otpExpiresAt, otpEmailSent: false, otpLastSentAt: new Date(), otpFailedCount: 0 },
      })
    } else {
      await this.prisma.approvalRequest.update({
        where: { id: entityId },
        data:  { otpHash, otpExpiresAt, otpEmailSent: false, otpLastSentAt: new Date(), otpFailedCount: 0 },
      })
    }

    const html = [
      `<p>Hi ${recipient.name},</p>`,
      `<p>Your verification code is: <strong>${code}</strong></p>`,
      `<p>This code expires in 10 minutes. Do not share it with anyone.</p>`,
    ].join('')

    // EmailService.send() never throws — it returns false on failure and
    // logs the error internally, so no try/catch is required here.
    const sent = await this.email.send({
      workspaceId: recipient.workspaceId,
      to:          recipient.email,
      subject:     'Your verification code',
      html,
      templateKey: 'otp',
      entityId,
      entityType,
    })

    if (sent) {
      if (entityType === 'contract') {
        await this.prisma.contract.update({ where: { id: entityId }, data: { otpEmailSent: true } })
      } else {
        await this.prisma.approvalRequest.update({ where: { id: entityId }, data: { otpEmailSent: true } })
      }
    } else {
      this.logger.warn(`OTP email not delivered for ${entityType} ${entityId} (recipient: ${recipient.email})`)
    }

    return { otpEmailSent: sent }
  }

  // Verify a submitted OTP code against the stored hash + expiry.
  // Increments otpFailedCount on a wrong code. Locks out after 5 failures (throws 410).
  // Returns true if valid; throws HttpException on invalid / expired / locked.
  async verify(
    entityType: 'contract' | 'approvalRequest',
    entityId:   string,
    code:       string,
  ): Promise<true> {
    const record = entityType === 'contract'
      ? await this.prisma.contract.findUniqueOrThrow({ where: { id: entityId } })
      : await this.prisma.approvalRequest.findUniqueOrThrow({ where: { id: entityId } })

    if (record.otpFailedCount >= 5) {
      throw new HttpException('OTP locked — too many failed attempts', HttpStatus.GONE)
    }
    if (!record.otpHash || !record.otpExpiresAt) {
      throw new HttpException('No OTP has been generated', HttpStatus.BAD_REQUEST)
    }
    if (new Date() > record.otpExpiresAt) {
      throw new HttpException('OTP has expired', HttpStatus.UNAUTHORIZED)
    }

    const valid = await bcrypt.compare(code, record.otpHash)
    if (!valid) {
      if (entityType === 'contract') {
        await this.prisma.contract.update({ where: { id: entityId }, data: { otpFailedCount: { increment: 1 } } })
      } else {
        await this.prisma.approvalRequest.update({ where: { id: entityId }, data: { otpFailedCount: { increment: 1 } } })
      }
      throw new HttpException('Incorrect OTP', HttpStatus.UNAUTHORIZED)
    }

    // Reset failed count on success
    if (entityType === 'contract') {
      await this.prisma.contract.update({ where: { id: entityId }, data: { otpFailedCount: 0 } })
    } else {
      await this.prisma.approvalRequest.update({ where: { id: entityId }, data: { otpFailedCount: 0 } })
    }

    return true
  }

  // Resend the OTP email. Rate-limited to once per 60 seconds via otpLastSentAt.
  // Regenerates a fresh code on each allowed resend.
  async resend(
    entityType: 'contract' | 'approvalRequest',
    entityId:   string,
    recipient:  { email: string; name: string; workspaceId: string },
  ): Promise<{ otpEmailSent: boolean }> {
    const record = entityType === 'contract'
      ? await this.prisma.contract.findUniqueOrThrow({ where: { id: entityId } })
      : await this.prisma.approvalRequest.findUniqueOrThrow({ where: { id: entityId } })

    if (record.otpLastSentAt) {
      const diffMs = Date.now() - record.otpLastSentAt.getTime()
      if (diffMs < 60_000) {
        throw new HttpException('Please wait before requesting another OTP', HttpStatus.TOO_MANY_REQUESTS)
      }
    }

    return this.generate(entityType, entityId, recipient)
  }

  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString()
  }
}

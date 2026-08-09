import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../../prisma/prisma.service'
import { EmailService } from '../automations/email.service'
import { CreateFeedbackDto } from './dto/create-feedback.dto'

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma:   PrismaService,
    private readonly email:    EmailService,
    private readonly config:   ConfigService,
  ) {}

  async create(workspaceId: string, userId: string, dto: CreateFeedbackDto) {
    const feedback = await this.prisma.feedback.create({
      data: { workspaceId, userId, ...dto },
    })

    // Notify founder — best-effort, never throws
    this.notifyFounder(workspaceId, feedback.id, userId, dto).catch(() => {})

    return { id: feedback.id }
  }

  private async notifyFounder(
    workspaceId: string,
    feedbackId:  string,
    userId:      string,
    dto:         CreateFeedbackDto,
  ) {
    const founderEmail = this.config.get<string>('FOUNDER_EMAIL')
    if (!founderEmail) return

    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { name: true, email: true },
    })

    const typeLabel: Record<string, string> = {
      BUG:       '🐛 Bug Report',
      FEATURE:   '✨ Feature Request',
      GENERAL:   '💬 General Feedback',
      COMPLAINT: '⚠️ Complaint',
    }

    await this.email.send({
      workspaceId,
      to:          founderEmail,
      subject:     `[ClearWork Feedback] ${typeLabel[dto.type] ?? dto.type}: ${dto.subject}`,
      html: `
        <div style="font-family: Inter, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #fff;">
          <h2 style="font-size: 18px; font-weight: 700; color: #101828; margin: 0 0 4px;">New Feedback Received</h2>
          <p style="font-size: 13px; color: #667085; margin: 0 0 24px;">From ${user?.name ?? 'Unknown'} (${user?.email ?? userId})</p>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr><td style="padding: 8px 0; font-size: 13px; color: #667085; width: 100px;">Type</td>
                <td style="padding: 8px 0; font-size: 13px; font-weight: 600; color: #101828;">${typeLabel[dto.type] ?? dto.type}</td></tr>
            <tr><td style="padding: 8px 0; font-size: 13px; color: #667085;">Subject</td>
                <td style="padding: 8px 0; font-size: 13px; font-weight: 600; color: #101828;">${dto.subject}</td></tr>
          </table>
          ${dto.message ? `<div style="background: #F9FAFB; border: 1px solid #EAECF0; border-radius: 8px; padding: 16px;">
            <p style="font-size: 13px; color: #344054; margin: 0; white-space: pre-wrap;">${dto.message}</p>
          </div>` : ''}
          <p style="font-size: 11px; color: #98A2B3; margin: 24px 0 0;">Feedback ID: ${feedbackId}</p>
        </div>
      `,
      templateKey: 'founder_feedback',
      entityId:    feedbackId,
      entityType:  'feedback',
    })
  }
}

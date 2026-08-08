import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { PrismaService } from '../../prisma/prisma.service'
import { EmailService } from './email.service'
import { PublicProfilesService } from '../public-profiles/public-profiles.service'

@Injectable()
export class NotificationsListener {
  constructor(
    private readonly prisma:              PrismaService,
    private readonly emailService:        EmailService,
    private readonly publicProfilesSvc:   PublicProfilesService,
  ) {}

  @OnEvent('project.completed')
  async onProjectCompleted(event: { projectId: string; workspaceId: string; approvalRequestId?: string }) {
    try {
      // 1. Fetch project with client/contact email
      const project = await this.prisma.project.findUnique({
        where: { id: event.projectId },
        include: {
          contact:   { select: { id: true, email: true, name: true } },
          client:    { select: { id: true, email: true, name: true } },
          workspace: { select: { id: true, name: true, businessName: true } },
        },
      })
      if (!project) return

      const recipientEmail = project.contact?.email ?? project.client?.email
      const recipientName  = project.contact?.name  ?? project.client?.name  ?? 'Client'
      if (!recipientEmail) return

      // 2. Idempotency — skip if a review already exists for this project
      const existing = await this.prisma.review.findFirst({
        where: { projectId: event.projectId },
      })
      if (existing) return

      // 3. Create Review record
      const review = await this.prisma.review.create({
        data: {
          workspaceId: event.workspaceId,
          projectId:   event.projectId,
          authorEmail: recipientEmail,
          authorName:  recipientName,
          status:      'PENDING',
        },
      })

      // 4. Send review request email
      const businessName = project.workspace.businessName ?? project.workspace.name ?? 'Your freelancer'
      const reviewUrl    = `${process.env.FRONTEND_URL ?? 'https://app.clearwork.in'}/review/${review.token}`

      await this.emailService.send({
        workspaceId: event.workspaceId,
        to:          recipientEmail,
        subject:     `Share your feedback — ${project.name}`,
        html: `
          <div style="font-family: Inter, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
            <h2 style="font-size: 20px; font-weight: 600; color: #101828; margin: 0 0 8px;">How was your experience?</h2>
            <p style="font-size: 15px; color: #475467; margin: 0 0 24px;">
              Hi ${recipientName}, <strong>${businessName}</strong> has completed your project <strong>"${project.name}"</strong>.
              We'd love to know how it went — your review helps them grow and helps others make informed decisions.
            </p>
            <a href="${reviewUrl}" style="display: inline-block; background: #4F46E5; color: #fff; font-size: 14px; font-weight: 600; padding: 12px 28px; border-radius: 8px; text-decoration: none;">Leave a Review</a>
            <p style="font-size: 12px; color: #98A2B3; margin: 24px 0 0;">Takes less than a minute. No account needed.</p>
          </div>
        `,
        templateKey: 'review_request',
        entityId:    review.id,
        entityType:  'review',
      })
    } catch (err) {
      // Never throw — notification failures must not affect the project completion
      console.error('Failed to create review request', err)
    }

    // Recalculate verified stats so the public profile reflects the newly completed project
    try {
      await this.publicProfilesSvc.recalculateUserStats(event.workspaceId)
    } catch (err) {
      console.error('Failed to recalculate stats on project completion', err)
    }
  }
}

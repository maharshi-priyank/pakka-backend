import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { OtpService } from '../shared/otp.service'
import { InvoicesService } from '../invoices/invoices.service'
import { ProjectsService } from '../projects/projects.service'
import { DecideApprovalRequestDto } from './dto/decide-approval-request.dto'

@Injectable()
export class ApprovalRequestsService {
  constructor(
    private readonly prisma:           PrismaService,
    private readonly eventEmitter:     EventEmitter2,
    private readonly otpService:       OtpService,
    private readonly invoicesService:  InvoicesService,
    private readonly projectsService:  ProjectsService,
  ) {}

  // ─── Agency: request sign-off ────────────────────────────────────────────────

  async requestSignoff(workspaceId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where:  { id: projectId, workspaceId },
      select: {
        id:      true,
        contact: { select: { email: true, name: true } },
        client:  { select: { email: true, name: true } },
      },
    })
    if (!project) throw new NotFoundException('Project not found')

    let approvalRequest: Awaited<ReturnType<typeof this.prisma.approvalRequest.create>>

    try {
      approvalRequest = await this.prisma.$transaction(
        async (tx) => {
          // Guard: no unpaid invoices
          const unpaidInvoice = await tx.invoice.findFirst({
            where: { projectId, status: { in: ['SENT', 'VIEWED', 'PARTIAL', 'OVERDUE'] } },
            select: { id: true },
          })
          if (unpaidInvoice) {
            throw new HttpException('Settle all outstanding invoices before requesting sign-off', HttpStatus.CONFLICT)
          }

          // Guard: no pending cost approvals
          const pendingCost = await tx.approvalRequest.findFirst({
            where: { projectId, kind: 'CHANGE_REQUEST_COST', status: 'PENDING' },
            select: { id: true },
          })
          if (pendingCost) {
            throw new HttpException('Resolve pending cost approvals first', HttpStatus.CONFLICT)
          }

          // Guard: no pending sign-off (idempotent)
          const pendingSignoff = await tx.approvalRequest.findFirst({
            where: { projectId, kind: 'PROJECT_SIGNOFF', status: 'PENDING' },
            select: { id: true },
          })
          if (pendingSignoff) {
            throw new HttpException('Sign-off already pending', HttpStatus.CONFLICT)
          }

          return tx.approvalRequest.create({
            data: {
              kind:        'PROJECT_SIGNOFF',
              requiresOtp: true,
              projectId,
              workspaceId,
              status:      'PENDING',
            },
          })
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      )
    } catch (err: any) {
      if (err?.code === 'P2002') {
        throw new HttpException('Sign-off already pending', HttpStatus.CONFLICT)
      }
      throw err
    }

    // Resolve recipient — contact takes priority over legacy client
    const email = project.contact?.email ?? project.client?.email
    const name  = project.contact?.name  ?? project.client?.name  ?? 'Client'

    if (email) {
      await this.otpService.generate('approvalRequest', approvalRequest.id, {
        email,
        name,
        workspaceId,
      })
    }

    // Re-fetch to capture updated otpEmailSent flag
    return this.prisma.approvalRequest.findUniqueOrThrow({
      where: { id: approvalRequest.id },
    })
  }

  // ─── List for project (portal) ───────────────────────────────────────────────

  async listForProject(workspaceId: string, projectId: string) {
    // Verify project belongs to workspace (IDOR guard)
    const project = await this.prisma.project.findFirst({
      where:  { id: projectId, workspaceId },
      select: { id: true },
    })
    if (!project) throw new NotFoundException('Project not found')

    return this.prisma.approvalRequest.findMany({
      where:   { projectId, workspaceId },
      orderBy: { createdAt: 'desc' },
    })
  }

  // ─── Portal: decide ───────────────────────────────────────────────────────────

  async decide(
    workspaceId:       string,
    approvalRequestId: string,
    dto:               DecideApprovalRequestDto,
    email:             string,
    name:              string,
  ) {
    const ar = await this.prisma.approvalRequest.findUnique({
      where: { id: approvalRequestId },
    })
    if (!ar) throw new NotFoundException('Approval request not found')
    if (ar.workspaceId !== workspaceId) throw new ForbiddenException()
    if (ar.status !== 'PENDING') {
      throw new HttpException('Already decided', HttpStatus.CONFLICT)
    }

    const { action, otp, decisionNote } = dto

    // ── CHANGE_REQUEST_COST ──────────────────────────────────────────────────
    if (ar.kind === 'CHANGE_REQUEST_COST') {
      if (action === 'APPROVE') {
        const updated = await this.prisma.$transaction(
          async (tx) => {
            const updatedAr = await tx.approvalRequest.update({
              where: { id: approvalRequestId },
              data:  { status: 'APPROVED', decidedAt: new Date() },
            })
            if (ar.changeRequestId) {
              await tx.changeRequest.update({
                where: { id: ar.changeRequestId },
                data:  { status: 'APPROVED_INVOICE_SENT' },
              })
            }
            return updatedAr
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        )
        await this.invoicesService.createFromApprovalRequest(workspaceId, approvalRequestId)
        this.eventEmitter.emit('approvalRequest.approved', {
          entityId:   approvalRequestId,
          workspaceId,
          kind:       'CHANGE_REQUEST_COST',
        })
        return updated
      }

      if (action === 'REJECT') {
        const updated = await this.prisma.$transaction(
          async (tx) => {
            const updatedAr = await tx.approvalRequest.update({
              where: { id: approvalRequestId },
              data:  { status: 'REJECTED', decisionNote: decisionNote ?? null, decidedAt: new Date() },
            })
            if (ar.changeRequestId) {
              await tx.changeRequest.update({
                where: { id: ar.changeRequestId },
                data:  { status: 'REJECTED' },
              })
            }
            return updatedAr
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        )
        this.eventEmitter.emit('approvalRequest.rejected', {
          entityId: approvalRequestId,
          workspaceId,
        })
        return updated
      }

      throw new HttpException(
        'Invalid action for CHANGE_REQUEST_COST — use APPROVE or REJECT',
        HttpStatus.BAD_REQUEST,
      )
    }

    // ── PROJECT_SIGNOFF ──────────────────────────────────────────────────────
    if (ar.kind === 'PROJECT_SIGNOFF') {
      if (action === 'APPROVE') {
        if (!otp) {
          throw new HttpException('OTP is required to approve a sign-off', HttpStatus.BAD_REQUEST)
        }
        await this.otpService.verify('approvalRequest', approvalRequestId, otp)

        const updated = await this.prisma.$transaction(
          async (tx) => {
            return tx.approvalRequest.update({
              where: { id: approvalRequestId },
              data:  { status: 'APPROVED', decidedAt: new Date() },
            })
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        )

        this.eventEmitter.emit('approvalRequest.approved', {
          entityId:   approvalRequestId,
          workspaceId,
          kind:       'PROJECT_SIGNOFF',
        })
        await this.projectsService.completeWithSignoff(ar.projectId, approvalRequestId)
        return updated
      }

      if (action === 'REQUEST_REVISION') {
        const updated = await this.prisma.approvalRequest.update({
          where: { id: approvalRequestId },
          data:  { status: 'REVISION_REQUESTED', decisionNote: decisionNote ?? null, decidedAt: new Date() },
        })

        this.eventEmitter.emit('approvalRequest.revisionRequested', {
          entityId:   approvalRequestId,
          workspaceId,
        })
        return updated
      }

      throw new HttpException(
        'Invalid action for PROJECT_SIGNOFF — use APPROVE or REQUEST_REVISION',
        HttpStatus.BAD_REQUEST,
      )
    }

    throw new HttpException('Unknown approval request kind', HttpStatus.INTERNAL_SERVER_ERROR)
  }

  // ─── Portal: resend OTP ───────────────────────────────────────────────────────

  async resendOtp(
    workspaceId:       string,
    approvalRequestId: string,
    email:             string,
    name:              string,
  ) {
    const ar = await this.prisma.approvalRequest.findUnique({
      where:  { id: approvalRequestId },
      select: { id: true, workspaceId: true },
    })
    if (!ar) throw new NotFoundException('Approval request not found')
    if (ar.workspaceId !== workspaceId) throw new ForbiddenException()

    return this.otpService.resend('approvalRequest', approvalRequestId, { email, name, workspaceId })
  }
}

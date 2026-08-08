import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { RespondChangeRequestDto, RespondChangeRequestType } from './dto/respond-change-request.dto';

const APPROVAL_INCLUDE = {
  id: true,
  kind: true,
  status: true,
  amount: true,
  description: true,
  requiresOtp: true,
  otpEmailSent: true,
  decidedAt: true,
  decisionNote: true,
};

@Injectable()
export class ChangeRequestsService {
  constructor(
    private readonly prisma:       PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async listForProject(workspaceId: string, projectId: string) {
    // Verify project belongs to workspace
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, workspaceId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');

    return this.prisma.changeRequest.findMany({
      where: { projectId, workspaceId },
      orderBy: { createdAt: 'desc' },
      include: {
        approvalRequests: { select: APPROVAL_INCLUDE },
      },
    });
  }

  async findOne(workspaceId: string, id: string) {
    const cr = await this.prisma.changeRequest.findUnique({
      where: { id },
      include: {
        approvalRequests: { select: APPROVAL_INCLUDE },
      },
    });
    if (!cr) throw new NotFoundException('Change request not found');
    if (cr.workspaceId !== workspaceId) throw new ForbiddenException();
    return cr;
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    const cr = await this.prisma.changeRequest.findUnique({
      where: { id },
      select: { workspaceId: true, status: true },
    });
    if (!cr) throw new NotFoundException('Change request not found');
    if (cr.workspaceId !== workspaceId) throw new ForbiddenException();
    if (cr.status !== 'PENDING_REVIEW') {
      throw new ConflictException('Change request can only be deleted when status is PENDING_REVIEW');
    }
    await this.prisma.changeRequest.delete({ where: { id } });
  }

  async respond(workspaceId: string, id: string, dto: RespondChangeRequestDto) {
    const cr = await this.prisma.changeRequest.findUnique({
      where: { id },
      select: { workspaceId: true, projectId: true, status: true },
    });
    if (!cr) throw new NotFoundException('Change request not found');
    if (cr.workspaceId !== workspaceId) throw new ForbiddenException();

    let updated;

    switch (dto.responseType) {
      case RespondChangeRequestType.IN_SCOPE:
        updated = await this.prisma.changeRequest.update({
          where: { id },
          data: { status: 'RESOLVED_IN_SCOPE', freelancerNote: dto.note ?? null },
          include: { approvalRequests: { select: APPROVAL_INCLUDE } },
        });
        break;

      case RespondChangeRequestType.NOT_FEASIBLE:
        if (!dto.note) throw new BadRequestException('note is required for NOT_FEASIBLE response');
        updated = await this.prisma.changeRequest.update({
          where: { id },
          data: { status: 'NOT_FEASIBLE', freelancerNote: dto.note },
          include: { approvalRequests: { select: APPROVAL_INCLUDE } },
        });
        break;

      case RespondChangeRequestType.ADDITIONAL_COST:
        if (!dto.amount || !dto.description) {
          throw new BadRequestException('amount and description are required for ADDITIONAL_COST response');
        }
        updated = await this.prisma.$transaction(async (tx) => {
          await tx.approvalRequest.create({
            data: {
              kind:            'CHANGE_REQUEST_COST',
              requiresOtp:     false,
              projectId:       cr.projectId,
              workspaceId,
              changeRequestId: id,
              amount:          dto.amount,
              description:     dto.description,
              status:          'PENDING',
            },
          });
          return tx.changeRequest.update({
            where: { id },
            data: { status: 'ADDITIONAL_COST_PENDING' },
            include: { approvalRequests: { select: APPROVAL_INCLUDE } },
          });
        });
        break;

      default:
        throw new BadRequestException('Invalid responseType');
    }

    this.eventEmitter.emit('changeRequest.responded', {
      entityId: id,
      workspaceId,
      projectId: cr.projectId,
      responseType: dto.responseType,
    });

    return updated;
  }
}

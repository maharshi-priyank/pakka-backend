import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { CreateWorkflowDto } from './dto/create-workflow.dto'
import { UpdateWorkflowDto } from './dto/update-workflow.dto'
import type { StepNode } from './workflow.engine'

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateWorkflowDto) {
    return this.prisma.automationWorkflow.create({
      data: {
        userId,
        name:        dto.name,
        description: dto.description,
        trigger:     { type: 'lead.created', config: {} } as Prisma.InputJsonValue,
        steps:       [] as unknown as Prisma.InputJsonValue,
      },
    })
  }

  async findAll(userId: string) {
    return this.prisma.automationWorkflow.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { runs: true } } },
    })
  }

  async findOne(userId: string, id: string) {
    const workflow = await this.prisma.automationWorkflow.findUnique({
      where:   { id },
      include: {
        runs: {
          orderBy: { startedAt: 'desc' },
          take:    20,
        },
      },
    })
    if (!workflow)           throw new NotFoundException('Workflow not found')
    if (workflow.userId !== userId) throw new ForbiddenException()
    return workflow
  }

  async update(userId: string, id: string, dto: UpdateWorkflowDto) {
    await this.findOne(userId, id)
    return this.prisma.automationWorkflow.update({
      where: { id },
      data: {
        ...(dto.name        !== undefined && { name:        dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isActive    !== undefined && { isActive:    dto.isActive }),
        ...(dto.trigger     !== undefined && { trigger:     dto.trigger     as Prisma.InputJsonValue }),
        ...(dto.steps       !== undefined && { steps:       dto.steps       as unknown as Prisma.InputJsonValue }),
      },
    })
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id)
    return this.prisma.automationWorkflow.delete({ where: { id } })
  }

  async getRuns(userId: string, workflowId: string, limit = 20) {
    await this.findOne(userId, workflowId)
    return this.prisma.workflowRun.findMany({
      where:   { workflowId },
      orderBy: { startedAt: 'desc' },
      take:    limit,
    })
  }

  async startRun(workflowId: string, entityId: string, entityType: string, userId: string) {
    const workflow = await this.prisma.automationWorkflow.findUnique({ where: { id: workflowId } })
    if (!workflow) return

    const steps = workflow.steps as unknown as StepNode[]
    const pending = flattenInitialSteps(steps)

    await this.prisma.workflowRun.create({
      data: {
        workflowId,
        userId,
        entityId,
        entityType,
        pendingSteps: pending as unknown as Prisma.InputJsonValue,
        nextFireAt:   new Date(),
      },
    })
    await this.prisma.automationWorkflow.update({
      where: { id: workflowId },
      data:  { runCount: { increment: 1 }, lastRunAt: new Date() },
    })
  }
}

// Flatten leading action/condition steps until (and including) first condition.
// Conditions expand at runtime by the scheduler.
function flattenInitialSteps(steps: StepNode[]): StepNode[] {
  return steps
}

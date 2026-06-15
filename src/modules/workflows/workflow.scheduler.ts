import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { WorkflowEngine, type StepNode, type ActionNode, type ConditionNode } from './workflow.engine'

function msFromDelay(delay: ActionNode['delay']): number {
  const { value, unit } = delay
  switch (unit) {
    case 'minutes': return value * 60 * 1000
    case 'hours':   return value * 60 * 60 * 1000
    case 'days':    return value * 24 * 60 * 60 * 1000
    default:        return 0
  }
}

@Injectable()
export class WorkflowScheduler {
  private readonly logger = new Logger(WorkflowScheduler.name)

  constructor(
    private readonly prisma:  PrismaService,
    private readonly engine:  WorkflowEngine,
  ) {}

  @Cron('* * * * *')
  async processRuns() {
    const runs = await this.prisma.workflowRun.findMany({
      where: { status: 'RUNNING', nextFireAt: { lte: new Date() } },
      take:  50,
    })
    for (const run of runs) {
      await this.processNextStep(run)
    }
  }

  private async processNextStep(run: {
    id:           string
    workflowId:   string
    entityId:     string
    entityType:   string
    workspaceId:  string
    pendingSteps: Prisma.JsonValue
    log:          Prisma.JsonValue
  }) {
    const pending = (run.pendingSteps as unknown as StepNode[]) ?? []
    const log     = (run.log as unknown as object[]) ?? []

    if (!pending.length) {
      await this.prisma.workflowRun.update({
        where: { id: run.id },
        data:  { status: 'COMPLETED', completedAt: new Date() },
      })
      return
    }

    const [head, ...rest] = pending

    try {
      if (head.type === 'condition') {
        const cond    = head as ConditionNode
        const result  = await this.engine.evaluateCondition(cond.condition, run.entityId, run.entityType)
        const chosen  = result ? cond.trueBranch : cond.falseBranch
        const newPending = [...chosen, ...rest]
        const logEntry   = { stepId: head.id, type: 'condition', result: result ? 'true' : 'false', executedAt: new Date().toISOString() }

        if (!newPending.length) {
          await this.prisma.workflowRun.update({
            where: { id: run.id },
            data:  {
              pendingSteps: [] as unknown as Prisma.InputJsonValue,
              log:          [...log, logEntry] as unknown as Prisma.InputJsonValue,
              status:       'COMPLETED',
              completedAt:  new Date(),
            },
          })
        } else {
          await this.prisma.workflowRun.update({
            where: { id: run.id },
            data:  {
              pendingSteps: newPending as unknown as Prisma.InputJsonValue,
              log:          [...log, logEntry] as unknown as Prisma.InputJsonValue,
              nextFireAt:   new Date(),
            },
          })
        }

      } else {
        const action = head as ActionNode
        await this.engine.executeAction(action.action, run.entityId, run.entityType, run.workspaceId)
        const logEntry = { stepId: head.id, type: 'action', actionType: action.action.type, executedAt: new Date().toISOString() }

        if (!rest.length) {
          await this.prisma.workflowRun.update({
            where: { id: run.id },
            data:  {
              pendingSteps: [] as unknown as Prisma.InputJsonValue,
              log:          [...log, logEntry] as unknown as Prisma.InputJsonValue,
              status:       'COMPLETED',
              completedAt:  new Date(),
            },
          })
        } else {
          const nextStep    = rest[0] as ActionNode
          const delayMs     = nextStep.type === 'action' ? msFromDelay(nextStep.delay) : 0
          const nextFireAt  = new Date(Date.now() + delayMs)
          await this.prisma.workflowRun.update({
            where: { id: run.id },
            data:  {
              pendingSteps: rest as unknown as Prisma.InputJsonValue,
              log:          [...log, logEntry] as unknown as Prisma.InputJsonValue,
              nextFireAt,
            },
          })
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.logger.error(`[workflow scheduler] run=${run.id} failed: ${msg}`)
      const logEntry = { stepId: head.id, error: msg, executedAt: new Date().toISOString() }
      await this.prisma.workflowRun.update({
        where: { id: run.id },
        data:  {
          status:      'FAILED',
          completedAt: new Date(),
          log:         [...log, logEntry] as unknown as Prisma.InputJsonValue,
        },
      })
    }
  }
}

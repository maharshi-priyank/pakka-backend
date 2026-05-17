import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../prisma/prisma.service'
import { DEFAULT_AUTOMATION_RULES } from './default-rules'
import { UpdateAutomationDto } from './dto/update-automation.dto'

@Injectable()
export class AutomationsService {
  constructor(private readonly prisma: PrismaService) {}

  async seedDefaultRules(userId: string): Promise<void> {
    await Promise.all(
      DEFAULT_AUTOMATION_RULES.map((rule) =>
        this.prisma.automationRule.upsert({
          where:  { userId_key: { userId, key: rule.key } },
          create: {
            userId,
            ...rule,
            triggerConfig: rule.triggerConfig as Prisma.InputJsonValue,
            actionConfig:  rule.actionConfig  as Prisma.InputJsonValue,
          },
          update: {},
        }),
      ),
    )
  }

  async findAll(userId: string, category?: string) {
    const rules = await this.prisma.automationRule.findMany({
      where:   { userId, ...(category ? { category } : {}) },
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
      include: { _count: { select: { executions: true } } },
    })

    // Group by category
    const grouped: Record<string, typeof rules> = {}
    for (const rule of rules) {
      if (!grouped[rule.category]) grouped[rule.category] = []
      grouped[rule.category].push(rule)
    }
    return grouped
  }

  async findOne(userId: string, id: string) {
    const rule = await this.prisma.automationRule.findUnique({ where: { id } })
    if (!rule) throw new NotFoundException('Automation rule not found')
    if (rule.userId !== userId) throw new ForbiddenException()
    return rule
  }

  async update(userId: string, id: string, dto: UpdateAutomationDto) {
    await this.findOne(userId, id)
    return this.prisma.automationRule.update({
      where: { id },
      data: {
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.actionConfig !== undefined && {
          actionConfig: dto.actionConfig as Prisma.InputJsonValue,
        }),
      },
    })
  }

  async getExecutions(userId: string, ruleId: string, limit = 20) {
    await this.findOne(userId, ruleId)
    return this.prisma.automationExecution.findMany({
      where:   { ruleId },
      orderBy: { firedAt: 'desc' },
      take:    limit,
    })
  }

  // Called by AutomationEngine to record execution result
  async recordExecution(opts: {
    ruleId:     string
    entityId?:  string
    entityType?: string
    status:     'SUCCESS' | 'FAILED' | 'SKIPPED'
    error?:     string
    metadata?:  Record<string, unknown>
  }) {
    await this.prisma.$transaction([
      this.prisma.automationExecution.create({
        data: {
          ruleId:     opts.ruleId,
          entityId:   opts.entityId,
          entityType: opts.entityType,
          status:     opts.status,
          error:      opts.error,
          metadata:   opts.metadata as Prisma.InputJsonValue | undefined,
        },
      }),
      this.prisma.automationRule.update({
        where: { id: opts.ruleId },
        data: {
          lastRunAt: new Date(),
          runCount:  { increment: 1 },
        },
      }),
    ])
  }
}

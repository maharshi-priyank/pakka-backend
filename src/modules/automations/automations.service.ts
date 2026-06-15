import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../../prisma/prisma.service'
import { DEFAULT_AUTOMATION_RULES } from './default-rules'
import { UpdateAutomationDto } from './dto/update-automation.dto'

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent'

const AI_GENERATE_PROMPT = `You are an automation workflow builder for ClearWork — a business management app for Indian freelancers and agencies.

The user will describe an automation they want in plain English. Convert it into one or more structured automation workflows.

AVAILABLE TRIGGER TYPES (use exactly these strings):
- lead.created — when a new lead is created
- lead.stage_changed — when a lead stage changes (triggerConfig: { toStage: "WON" | "LOST" | "NEGOTIATING" | "PROPOSAL_SENT" })
- proposal.accepted — when a proposal is accepted by the client
- proposal.sent — when a proposal is sent to a client
- contract.signed — when a contract is signed
- contract.sent — when a contract is sent to a client
- invoice.paid — when an invoice is marked as paid
- invoice.sent — when an invoice is sent
- invoice.overdue — when an invoice becomes overdue
- meeting.scheduled — when a meeting is scheduled

AVAILABLE ACTION TYPES (use exactly these strings):
- send_email.client — send an email to the client (actionConfig: { subject: string, body: string })
- send_email.me — send a notification email to the workspace owner (actionConfig: { subject: string, body: string })
- create.invoice — automatically create an invoice draft (actionConfig: {})
- create.contract — automatically create a contract draft (actionConfig: {})
- change_lead_stage — change lead stage (actionConfig: { stage: "WON" | "PROPOSAL_SENT" | "NEGOTIATING" | "LOST" })
- add_note — add a note to the entity (actionConfig: { note: string })

Each workflow has ONE trigger and ONE primary action step. You can output up to 3 workflows if the user's request implies multiple distinct automations.

STEP delay: how long after the trigger to wait before running the action. Use { value: 0, unit: "minutes" } for immediate. For "3 days later" use { value: 3, unit: "days" }.

Return ONLY a valid JSON array. No markdown, no explanation.

JSON schema for each workflow:
{
  "name": string,           // short human-readable name
  "description": string,    // one sentence explaining what it does
  "category": string,       // one of: invoice, proposal, contract, lead, business
  "triggerType": string,    // from AVAILABLE TRIGGER TYPES above
  "triggerConfig": object,  // {} or { toStage: "..." } etc.
  "actionType": string,     // from AVAILABLE ACTION TYPES above
  "actionConfig": object,   // { subject, body } or {} etc.
  "delayValue": number,     // 0 for immediate, or N for delayed
  "delayUnit": string       // "minutes" | "hours" | "days"
}`

export interface GeneratedRule {
  name:          string
  description:   string
  category:      string
  triggerType:   string
  triggerConfig: Record<string, unknown>
  actionType:    string
  actionConfig:  Record<string, unknown>
  delayValue:    number
  delayUnit:     string
}

@Injectable()
export class AutomationsService {
  private readonly logger = new Logger(AutomationsService.name)

  constructor(
    private readonly prisma:  PrismaService,
    private readonly config:  ConfigService,
  ) {}

  async seedDefaultRules(workspaceId: string): Promise<void> {
    await Promise.all(
      DEFAULT_AUTOMATION_RULES.map((rule) =>
        this.prisma.automationRule.upsert({
          where:  { workspaceId_key: { workspaceId, key: rule.key } },
          create: {
            workspaceId,
            ...rule,
            triggerConfig: rule.triggerConfig as Prisma.InputJsonValue,
            actionConfig:  rule.actionConfig  as Prisma.InputJsonValue,
          },
          update: {},
        }),
      ),
    )
  }

  async findAll(workspaceId: string, category?: string) {
    const rules = await this.prisma.automationRule.findMany({
      where:   { workspaceId, ...(category ? { category } : {}) },
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

  async findOne(workspaceId: string, id: string) {
    const rule = await this.prisma.automationRule.findUnique({ where: { id } })
    if (!rule) throw new NotFoundException('Automation rule not found')
    if (rule.workspaceId !== workspaceId) throw new ForbiddenException()
    return rule
  }

  async update(workspaceId: string, id: string, dto: UpdateAutomationDto) {
    await this.findOne(workspaceId, id)
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

  async getExecutions(workspaceId: string, ruleId: string, limit = 20) {
    await this.findOne(workspaceId, ruleId)
    return this.prisma.automationExecution.findMany({
      where:   { ruleId },
      orderBy: { firedAt: 'desc' },
      take:    limit,
    })
  }

  async generateWithAI(prompt: string): Promise<GeneratedRule[]> {
    const apiKey = this.config.get<string>('geminiApiKey')
    if (!apiKey) throw new BadRequestException('AI service not configured')

    const body = {
      system_instruction: { parts: [{ text: AI_GENERATE_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 2048 },
    }

    let res: Response | undefined
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 1500))
      res = await fetch(GEMINI_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-goog-api-key': apiKey },
        body: JSON.stringify(body),
      })
      if (res.status !== 503) break
    }

    if (!res!.ok) {
      this.logger.error(`Gemini error ${res!.status}: ${await res!.text()}`)
      throw new BadRequestException('AI service is temporarily busy — please try again')
    }

    const json = await res!.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]'

    let rules: GeneratedRule[]
    try {
      rules = JSON.parse(text)
      if (!Array.isArray(rules)) throw new Error('not an array')
    } catch {
      this.logger.error(`AI returned invalid JSON: ${text}`)
      throw new BadRequestException('AI returned an unexpected response — please try rephrasing')
    }

    return rules.slice(0, 3)
  }

  async createFromAI(workspaceId: string, rules: GeneratedRule[]) {
    const created = await Promise.all(
      rules.map((rule) =>
        this.prisma.automationWorkflow.create({
          data: {
            workspaceId,
            name:        rule.name,
            description: rule.description,
            isActive:    false,
            trigger: {
              type:   rule.triggerType,
              config: rule.triggerConfig ?? {},
            } as Prisma.InputJsonValue,
            steps: [
              {
                id:     `step_${Date.now()}`,
                type:   'action',
                delay:  { value: rule.delayValue ?? 0, unit: rule.delayUnit ?? 'minutes' },
                action: { type: rule.actionType, config: rule.actionConfig ?? {} },
              },
            ] as unknown as Prisma.InputJsonValue,
          },
        })
      )
    )
    return created
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

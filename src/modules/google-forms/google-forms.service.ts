import { Injectable, Logger, NotFoundException, BadRequestException, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { nanoid } from 'nanoid';
import { PrismaService } from '../../prisma/prisma.service';
import { WebhookPayloadDto } from './dto/webhook-payload.dto';

const FIELD_KEYWORDS: Record<string, string[]> = {
  name:    ['name', 'full name', 'your name'],
  email:   ['email', 'e-mail', 'mail'],
  phone:   ['phone', 'mobile', 'contact', 'number'],
  company: ['company', 'business', 'organization', 'organisation', 'firm'],
  service: ['service', 'interested in', 'looking for', 'requirement'],
  budget:  ['budget', 'price', 'cost'],
  notes:   ['message', 'note', 'details', 'query', 'description'],
};

@Injectable()
export class GoogleFormsService {
  private readonly logger = new Logger(GoogleFormsService.name);

  constructor(
    private readonly prisma:  PrismaService,
    private readonly config:  ConfigService,
  ) {}

  async connect(userId: string) {
    const token = nanoid(21);
    await this.prisma.user.update({
      where: { id: userId },
      data:  { googleFormsWebhookToken: token, googleFormsConnected: true },
    });
    return this.buildSetupInfo(token);
  }

  async disconnect(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data:  { googleFormsWebhookToken: null, googleFormsConnected: false },
    });
  }

  async getSetupInfo(userId: string) {
    const user = await this.prisma.user.findUnique({
      where:  { id: userId },
      select: { googleFormsWebhookToken: true, googleFormsConnected: true },
    });
    if (!user?.googleFormsConnected || !user.googleFormsWebhookToken) {
      throw new BadRequestException('Google Forms not connected');
    }
    return this.buildSetupInfo(user.googleFormsWebhookToken);
  }

  async handleWebhook(token: string, dto: WebhookPayloadDto) {
    const user = await this.prisma.user.findUnique({
      where:  { googleFormsWebhookToken: token },
      select: { id: true, plan: true, planExpiresAt: true },
    });
    if (!user) throw new NotFoundException('Invalid webhook token');

    // Plan limit check — same logic as LeadsService
    const effectivePlan = (user.planExpiresAt && user.planExpiresAt < new Date()) ? 'FREE' : user.plan;
    if (effectivePlan === 'FREE') {
      const count = await this.prisma.lead.count({
        where: { userId: user.id, isDeleted: false, stage: { notIn: ['WON', 'LOST'] } },
      });
      if (count >= 3) {
        throw new HttpException({ message: 'Free plan: 3 active leads limit reached.', code: 'PLAN_LIMIT' }, 402);
      }
    }

    const mapped = this.mapAnswers(dto.answers, dto.respondentEmail);

    await this.prisma.lead.create({
      data: {
        userId:  user.id,
        name:    mapped.name    || dto.respondentEmail || 'Unknown',
        email:   mapped.email   || dto.respondentEmail || undefined,
        phone:   mapped.phone   || undefined,
        company: mapped.company || undefined,
        service: mapped.service || undefined,
        budget:  mapped.budget  as any,
        notes:   mapped.notes   || undefined,
        source:  'Google Forms',
        stage:   'ENQUIRY',
      },
    });

    this.logger.log(`Lead created from Google Forms webhook for user ${user.id}`);
    return { received: true };
  }

  private mapAnswers(answers: Record<string, string | string[]>, respondentEmail?: string) {
    const result: Record<string, string | undefined> = {};

    for (const [question, response] of Object.entries(answers)) {
      const normalized = question.toLowerCase().trim();
      const value = Array.isArray(response) ? response.join(', ') : String(response ?? '').trim();
      if (!value) continue;

      for (const [field, keywords] of Object.entries(FIELD_KEYWORDS)) {
        if (result[field]) continue;
        if (keywords.some(kw => normalized.includes(kw))) {
          if (field === 'budget') {
            const n = parseFloat(value.replace(/[^0-9.]/g, ''));
            result[field] = isNaN(n) ? undefined : String(n);
          } else {
            result[field] = value;
          }
        }
      }
    }

    // Fallback: use respondentEmail if no email was mapped
    if (!result['email'] && respondentEmail) {
      result['email'] = respondentEmail;
    }

    return result;
  }

  private buildSetupInfo(token: string) {
    const backendUrl = this.config.get<string>('backendUrl') ?? 'http://localhost:3000/api';
    const webhookUrl = `${backendUrl}/google-forms/webhook/${token}`;
    const scriptSnippet = this.buildScript(webhookUrl);
    return { webhookUrl, scriptSnippet };
  }

  private buildScript(webhookUrl: string): string {
    return `function onFormSubmit(e) {
  var items = e.response.getItemResponses();
  var answers = {};
  items.forEach(function(item) {
    answers[item.getItem().getTitle()] = item.getResponse();
  });
  UrlFetchApp.fetch("${webhookUrl}", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      respondentEmail: e.response.getRespondentEmail(),
      answers: answers
    })
  });
}`;
  }
}

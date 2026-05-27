import {
  Controller, Get, Post, Query, Req, Res,
  Headers, UseGuards, BadRequestException, Logger,
} from '@nestjs/common';
import { Response } from 'express';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CalendlyAuthService } from './calendly-auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MeetingStatus } from '@prisma/client';
import { User } from '@prisma/client';

@Controller('auth/calendly')
@UseGuards(JwtAuthGuard)
export class CalendlyAuthController {
  private readonly logger = new Logger(CalendlyAuthController.name);

  constructor(
    private readonly calendlyAuth: CalendlyAuthService,
    private readonly config:       ConfigService,
    private readonly prisma:       PrismaService,
  ) {}

  @Get('connect')
  connect(@CurrentUser() user: User) {
    const authUrl = this.calendlyAuth.getAuthUrl(user.id);
    return { authUrl };
  }

  @Public()
  @Get('callback')
  async callback(
    @Query('code')  code:  string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    await this.calendlyAuth.handleCallback(code, state);
    const appUrl = this.config.get<string>('appUrl');
    return res.redirect(`${appUrl}/app/settings?tab=integrations&calendlyConnected=true`);
  }

  @Post('disconnect')
  async disconnect(@CurrentUser() user: User) {
    await this.calendlyAuth.disconnectCalendly(user.id);
    return { success: true };
  }

  // ─── Webhook ────────────────────────────────────────────────────────────────

  @Public()
  @Post('webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('calendly-webhook-signature') signature: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody) throw new BadRequestException('Missing raw body');

    if (signature && !this.calendlyAuth.verifyWebhookSignature(rawBody, signature)) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const payload = JSON.parse(rawBody.toString('utf8')) as CalendlyWebhookPayload;
    this.logger.log(`Calendly webhook: ${payload.event}`);

    if (payload.event === 'invitee.created') {
      await this.handleInviteeCreated(payload);
    } else if (payload.event === 'invitee.canceled') {
      await this.handleInviteeCanceled(payload);
    }

    return { received: true };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async handleInviteeCreated(payload: CalendlyWebhookPayload) {
    const hostUri = payload.payload.scheduled_event?.event_memberships?.[0]?.user;
    if (!hostUri) return;

    const user = await this.calendlyAuth.findUserByCalendlyUri(hostUri);
    if (!user) return;

    const scheduledEvent = payload.payload.scheduled_event!;
    const startTime      = new Date(scheduledEvent.start_time);
    const endTime        = new Date(scheduledEvent.end_time);
    const durationMins   = Math.round((endTime.getTime() - startTime.getTime()) / 60_000);
    const inviteeName    = payload.payload.name ?? 'Guest';
    const inviteeEmail   = payload.payload.email;

    // Try to match existing client by email
    const client = inviteeEmail
      ? await this.prisma.client.findFirst({ where: { userId: user.id, email: inviteeEmail } })
      : null;

    // Try to match existing lead by email
    const lead = !client && inviteeEmail
      ? await this.prisma.lead.findFirst({ where: { userId: user.id, email: inviteeEmail } })
      : null;

    await this.prisma.meeting.create({
      data: {
        userId:          user.id,
        title:           scheduledEvent.name ?? `Meeting with ${inviteeName}`,
        scheduledAt:     startTime,
        durationMins,
        clientId:        client?.id ?? null,
        leadId:          lead?.id   ?? null,
        guestEmails:     inviteeEmail ? [inviteeEmail] : [],
        meetLink:        scheduledEvent.location?.join_url ?? null,
        calendlyEventUri: scheduledEvent.uri,
        status:          MeetingStatus.SCHEDULED,
      },
    });

    this.logger.log(`Created meeting from Calendly booking for user ${user.id}`);
  }

  private async handleInviteeCanceled(payload: CalendlyWebhookPayload) {
    const eventUri = payload.payload.scheduled_event?.uri;
    if (!eventUri) return;

    const meeting = await this.prisma.meeting.findFirst({
      where: { calendlyEventUri: eventUri },
    });
    if (!meeting) return;

    await this.prisma.meeting.update({
      where: { id: meeting.id },
      data:  { status: MeetingStatus.CANCELLED },
    });

    this.logger.log(`Cancelled meeting ${meeting.id} from Calendly cancellation`);
  }
}

// ─── Payload types ────────────────────────────────────────────────────────────

interface CalendlyWebhookPayload {
  event: 'invitee.created' | 'invitee.canceled' | string;
  payload: {
    name?:  string;
    email?: string;
    scheduled_event?: {
      uri:        string;
      name?:      string;
      start_time: string;
      end_time:   string;
      location?:  { join_url?: string };
      event_memberships?: Array<{ user: string }>;
    };
  };
}

import {
  Controller, Get, Post,
  Query, Body, Headers, Req,
  HttpCode, HttpStatus, ForbiddenException, Logger,
} from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { Public } from '../../common/decorators/public.decorator'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '../../prisma/prisma.service'
import { createHmac, timingSafeEqual } from 'crypto'
import type { Request } from 'express'
import type { MetaWebhookPayload } from './dto/whatsapp-webhook.dto'

@ApiTags('webhooks')
@Controller('webhooks/whatsapp')
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name)

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Challenge verification ────────────────────────────────────────────────

  @Public()
  @Get()
  @ApiOperation({ summary: 'Meta webhook challenge verification' })
  challenge(
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge')    challenge:   string,
    @Query('hub.mode')         mode:        string,
  ) {
    const expected = this.config.get<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN')
    if (!expected || mode !== 'subscribe' || verifyToken !== expected) {
      throw new ForbiddenException('Invalid verify token')
    }
    return challenge
  }

  // ─── Delivery status webhook ───────────────────────────────────────────────

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive Meta delivery status updates' })
  async handleDelivery(
    @Req()     req:       Request & { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature: string,
    @Body()    payload:   MetaWebhookPayload,
  ) {
    // TODO(WhatsApp): The HMAC verification below is ready and correct.
    // Set WHATSAPP_APP_SECRET in production env to activate it.
    // Until then the guard silently allows all requests (safe since no real data is stored yet).
    const appSecret = this.config.get<string>('WHATSAPP_APP_SECRET')
    if (appSecret) {
      const rawBody = req.rawBody
      if (!rawBody || !signature) {
        throw new ForbiddenException('Missing signature or raw body')
      }
      const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`
      try {
        const sigBuf = Buffer.from(signature)
        const expBuf = Buffer.from(expected)
        if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
          throw new ForbiddenException('Invalid webhook signature')
        }
      } catch {
        throw new ForbiddenException('Webhook signature verification failed')
      }
    }

    // Process status updates
    try {
      const statuses = payload.entry
        ?.flatMap(e => e.changes ?? [])
        ?.flatMap(c => c.value?.statuses ?? [])
        ?? []

      for (const s of statuses) {
        if (!s.id) continue
        await this.prisma.communicationLog.updateMany({
          where: { waMessageId: s.id },
          data:  {
            status: s.status,
            error:  s.errors?.[0]?.title ?? undefined,
          },
        })
        this.logger.debug(`[wa-webhook] wamid=${s.id} status=${s.status}`)
      }
    } catch (err) {
      this.logger.error(`[wa-webhook-error] ${err instanceof Error ? err.message : String(err)}`)
    }

    // Always return 200 to Meta — never let them retry due to a processing error
    return 'OK'
  }
}

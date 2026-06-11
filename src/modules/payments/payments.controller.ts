import {
  Body, Controller, Delete, Get, Headers, HttpCode,
  Post, Query, Req, Res, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { User } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import type { CashfreeWebhookEvent } from './dto/webhook-event.dto';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly stripe:   StripeService,
    private readonly config: ConfigService,
  ) {}

  @Post('create-subscription')
  @UseGuards(JwtAuthGuard)
  createSubscription(
    @CurrentUser() user: User,
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.payments.createSubscription(user.id, dto.tier);
  }

  @Get('subscription')
  @UseGuards(JwtAuthGuard)
  getSubscription(@CurrentUser() user: User) {
    return this.payments.getSubscription(user.id);
  }

  @Delete('subscription')
  @UseGuards(JwtAuthGuard)
  cancelSubscription(@CurrentUser() user: User) {
    return this.payments.cancelSubscription(user.id);
  }

  @Get('current-pricing')
  @UseGuards(JwtAuthGuard)
  currentPricing() {
    return this.payments.currentPricing();
  }

  @Public()
  @Get('subscription-return')
  subscriptionReturnGet(@Res() res: Response) {
    const frontendUrl = this.config.get<string>('frontendUrl') ?? 'http://localhost:5173';
    return res.redirect(302, `${frontendUrl}/billing/success`);
  }

  @Public()
  @Post('subscription-return')
  @HttpCode(302)
  subscriptionReturnPost(@Res() res: Response) {
    const frontendUrl = this.config.get<string>('frontendUrl') ?? 'http://localhost:5173';
    return res.redirect(302, `${frontendUrl}/billing/success`);
  }

  @Public()
  @Get('subscription-cancel')
  subscriptionCancelGet(@Res() res: Response) {
    const frontendUrl = this.config.get<string>('frontendUrl') ?? 'http://localhost:5173';
    return res.redirect(302, `${frontendUrl}/billing/cancelled`);
  }

  @Public()
  @Post('subscription-cancel')
  @HttpCode(302)
  subscriptionCancelPost(@Res() res: Response) {
    const frontendUrl = this.config.get<string>('frontendUrl') ?? 'http://localhost:5173';
    return res.redirect(302, `${frontendUrl}/billing/cancelled`);
  }

  // ── Stripe endpoints ───────────────────────────────────────────────────────

  @Post('stripe/checkout')
  @UseGuards(JwtAuthGuard)
  createStripeCheckout(
    @CurrentUser() user: User,
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.stripe.createCheckoutSession(user.id, dto.tier);
  }

  @Public()
  @Get('stripe/return')
  stripeReturn(@Res() res: Response, @Query('session_id') _sessionId: string) {
    const frontendUrl = this.config.get<string>('frontendUrl') ?? 'http://localhost:5173';
    return res.redirect(302, `${frontendUrl}/billing/success`);
  }

  @Public()
  @Post('stripe/webhook')
  @HttpCode(200)
  async stripeWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('stripe-signature') signature: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody || !signature) throw new UnauthorizedException('Missing Stripe signature');

    const event = this.stripe.verifyAndParseWebhook(rawBody, signature);
    await this.stripe.handleWebhookEvent(event);
    return { received: true };
  }

  // ── Cashfree webhook ───────────────────────────────────────────────────────

  @Public()
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-webhook-signature') signature: string,
    @Headers('x-webhook-timestamp') timestamp: string,
    @Body() body: CashfreeWebhookEvent,
  ) {
    const rawBody = req.rawBody;

    if (rawBody && signature && timestamp) {
      const valid = this.payments.verifyWebhookSignature(rawBody, signature, timestamp);
      if (!valid) throw new UnauthorizedException('Invalid webhook signature');
    }

    const cashfreeRef = (body as any)?.data?.payment?.cf_payment_id
      ?? (body as any)?.data?.subscription?.subscription_id + '_' + body.type;

    await this.payments.handleWebhook(body, cashfreeRef);
    return { received: true };
  }
}

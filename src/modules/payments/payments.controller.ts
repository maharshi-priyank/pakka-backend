import {
  Body, Controller, Delete, Get, Headers, HttpCode,
  Post, Req, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { User } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import type { CashfreeWebhookEvent } from './dto/webhook-event.dto';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

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

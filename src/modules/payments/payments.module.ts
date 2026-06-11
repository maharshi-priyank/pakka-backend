import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { CashfreeProvider } from './cashfree.provider';
import { PlanResolutionService } from './plan-resolution.service';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';
import { PaymentsController } from './payments.controller';

@Module({
  imports: [ConfigModule],
  controllers: [PaymentsController],
  providers: [
    PlanResolutionService,
    PaymentsService,
    StripeService,
    { provide: PAYMENT_PROVIDER, useClass: CashfreeProvider },
    CashfreeProvider,
  ],
  exports: [PaymentsService, StripeService],
})
export class PaymentsModule {}

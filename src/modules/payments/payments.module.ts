import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PAYMENT_PROVIDER } from './payment-provider.interface';
import { RazorpayProvider } from './razorpay.provider';
import { PlanResolutionService } from './plan-resolution.service';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';
import { PaymentsController } from './payments.controller';
import { ProductEventsModule } from '../product-events/product-events.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';

@Module({
  imports: [ConfigModule, ProductEventsModule, WorkspacesModule],
  controllers: [PaymentsController],
  providers: [
    PlanResolutionService,
    PaymentsService,
    StripeService,
    { provide: PAYMENT_PROVIDER, useClass: RazorpayProvider },
    RazorpayProvider,
  ],
  exports: [PaymentsService, StripeService, PAYMENT_PROVIDER],
})
export class PaymentsModule {}

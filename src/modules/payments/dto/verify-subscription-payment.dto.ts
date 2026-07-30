import { IsString } from 'class-validator';

export class VerifySubscriptionPaymentDto {
  @IsString()
  razorpay_payment_id: string;

  @IsString()
  razorpay_subscription_id: string;

  @IsString()
  razorpay_signature: string;
}

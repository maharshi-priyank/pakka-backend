import { IsString, IsOptional, IsNumber, Min, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefundDto {
  @ApiProperty({ description: 'Razorpay payment id or Stripe payment intent id' })
  @IsString() paymentId!: string;

  @ApiProperty({ required: false, description: 'Full refund if omitted' })
  @IsOptional() @IsNumber() @Min(1) amount?: number;

  @ApiProperty({ required: false, enum: ['razorpay', 'stripe'], default: 'razorpay' })
  @IsOptional() @IsIn(['razorpay', 'stripe']) provider?: 'razorpay' | 'stripe';

  @ApiProperty({ required: false }) @IsOptional() @IsString() reason?: string;
}

export class SyncSubscriptionDto {
  @ApiProperty() @IsString() subscriptionId!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() userId?: string;
  @ApiProperty({ required: false, enum: ['razorpay', 'stripe'] }) @IsOptional() @IsIn(['razorpay', 'stripe']) provider?: 'razorpay' | 'stripe';
  @ApiProperty({ required: false }) @IsOptional() @IsString() reason?: string;
}

export class ReplayEventDto {
  @ApiProperty() @IsString() billingEventId!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() reason?: string;
}

import { IsString, IsOptional, IsDateString, IsBoolean, IsEnum, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Plan, SubscriptionStatus } from '@prisma/client';

export class PlanOverrideDto {
  @ApiProperty({ enum: Plan, required: false })
  @IsOptional() @IsEnum(Plan) plan?: Plan;

  @ApiProperty({ required: false })
  @IsOptional() @IsDateString() planExpiresAt?: string;

  @ApiProperty({ enum: SubscriptionStatus, required: false })
  @IsOptional() @IsEnum(SubscriptionStatus) subscriptionStatus?: SubscriptionStatus;

  @ApiProperty({ required: false, description: 'Reason for the override (audited)' })
  @IsOptional() @IsString() reason?: string;
}

export class FeatureFlagToggleDto {
  @ApiProperty() @IsString() @MaxLength(64) @Matches(/^[a-z][a-z0-9_.-]{1,63}$/) flag!: string;
  @ApiProperty() @IsBoolean() enabled!: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsString() reason?: string;
}

export class RecordFixDto {
  @ApiProperty({ description: 'e.g. contract | invoice' }) @IsString() entityType!: string;
  @ApiProperty() @IsString() entityId!: string;
  @ApiProperty({ description: 'e.g. verify | force-resend' }) @IsString() fix!: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() reason?: string;
}

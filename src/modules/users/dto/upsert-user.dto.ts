import { IsString, IsEmail, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

// Used internally by the service (populated from JWT, not request body)
export class UpsertUserDto {
  id:    string;
  email: string;
  name:  string;
  acquisitionSource?: string;
  acquisitionMedium?: string;
  acquisitionCampaign?: string;
  acquisitionContent?: string;
  acquisitionTerm?: string;
}

/** First-party, privacy-safe attribution accepted during the auth sync. */
export class SyncUserDto {
  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  acquisitionSource?: string;

  @ApiPropertyOptional({ maxLength: 80 })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  acquisitionMedium?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  acquisitionCampaign?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  acquisitionContent?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  acquisitionTerm?: string;
}

// Used by PATCH /users/me — all fields optional, sent in request body
export class UpdateUserDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  businessType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gstNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  panNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccountName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankIfsc?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  upiId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  upiQrUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultHsnSac?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultLutNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  razorpayKeyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  razorpayKeySecret?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  onboardingComplete?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxLabel?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ibanNumber?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  swiftCode?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  routingNumber?: string | null;
}

import {
  IsString, IsOptional, IsEmail, IsEnum, IsNumber, IsDateString, Min, IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContactStage } from '@prisma/client';

export class CreateContactDto {
  @ApiProperty()
  @IsString()
  name: string;

  // R1/R2: required at creation, no silent default (KTD8's 5-currency set).
  @ApiProperty()
  @IsString()
  country: string;

  @ApiProperty({ enum: ['INR', 'USD', 'EUR', 'GBP', 'AED'] })
  @IsIn(['INR', 'USD', 'EUR', 'GBP', 'AED'])
  currency: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  company?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gstNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  service?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  dealValue?: number;

  @ApiPropertyOptional({ enum: ['instagram', 'linkedin', 'referral', 'website', 'cold_outreach', 'other'] })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ enum: ContactStage })
  @IsOptional()
  @IsEnum(ContactStage)
  stage?: ContactStage;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  followUpAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

import { IsString, IsOptional, IsEmail, IsEnum, IsNumber, IsDateString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeadStage } from '@prisma/client';

export class CreateLeadDto {
  @ApiProperty()
  @IsString()
  name: string;

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
  service?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  budget?: number;

  @ApiPropertyOptional({ enum: ['instagram', 'linkedin', 'referral', 'website', 'cold_outreach', 'other'] })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ enum: LeadStage })
  @IsOptional()
  @IsEnum(LeadStage)
  stage?: LeadStage;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  followUpAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientId?: string;
}

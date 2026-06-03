import {
  IsString, IsOptional, IsNumber, IsDateString,
  IsArray, ValidateNested, IsIn, Min, IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LineItemDto {
  @ApiProperty() @IsString() description: string;
  @ApiProperty() @IsNumber() @Min(0) qty: number;
  @ApiProperty() @IsNumber() @Min(0) rate: number;
  @ApiPropertyOptional({ enum: [0, 5, 12, 18, 28] })
  @IsIn([0, 5, 12, 18, 28]) @IsNumber() @IsOptional() gstRate?: number;
}

export class ScopeItemDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
}

export class MilestoneDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsString() @IsOptional() duration?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
}

export class DeliverableDto {
  @ApiProperty() @IsString() item: string;
  @ApiPropertyOptional() @IsString() @IsOptional() format?: string;
}

export class PaymentMilestoneDto {
  @ApiProperty() @IsString() milestone: string;
  @ApiProperty() @IsNumber() @Min(0) amount: number;
  @ApiPropertyOptional() @IsString() @IsOptional() dueOn?: string;
}

export class CaseStudyDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() description: string;
  @ApiPropertyOptional() @IsString() @IsOptional() result?: string;
  @ApiPropertyOptional() @IsUrl() @IsOptional() link?: string;
}

export class FaqItemDto {
  @ApiProperty() @IsString() question: string;
  @ApiProperty() @IsString() answer: string;
}

export class ProposalContentDto {
  // ── Cover ────────────────────────────────────────────────────────────────
  @ApiPropertyOptional() @IsString() @IsOptional() intro?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() whyUs?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() nextSteps?: string;

  // ── Scope ────────────────────────────────────────────────────────────────
  @ApiPropertyOptional()
  @IsArray() @ValidateNested({ each: true }) @Type(() => ScopeItemDto) @IsOptional()
  scopeItems?: ScopeItemDto[];

  @ApiPropertyOptional()
  @IsArray() @ValidateNested({ each: true }) @Type(() => DeliverableDto) @IsOptional()
  deliverables?: DeliverableDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsArray() @IsString({ each: true }) @IsOptional()
  exclusions?: string[];

  // ── Pricing ──────────────────────────────────────────────────────────────
  @ApiPropertyOptional()
  @IsArray() @ValidateNested({ each: true }) @Type(() => LineItemDto) @IsOptional()
  lineItems?: LineItemDto[];

  @ApiPropertyOptional() @IsString() @IsOptional() pricingNotes?: string;
  @ApiPropertyOptional() @IsIn(['IGST', 'CGST_SGST', 'EXEMPT']) @IsOptional() gstType?: string;

  @ApiPropertyOptional()
  @IsArray() @ValidateNested({ each: true }) @Type(() => PaymentMilestoneDto) @IsOptional()
  paymentSchedule?: PaymentMilestoneDto[];

  // ── Timeline ─────────────────────────────────────────────────────────────
  @ApiPropertyOptional()
  @IsArray() @ValidateNested({ each: true }) @Type(() => MilestoneDto) @IsOptional()
  milestones?: MilestoneDto[];

  // ── Terms ────────────────────────────────────────────────────────────────
  @ApiPropertyOptional() @IsString() @IsOptional() terms?: string;

  // ── Credibility ──────────────────────────────────────────────────────────
  @ApiPropertyOptional()
  @IsArray() @ValidateNested({ each: true }) @Type(() => CaseStudyDto) @IsOptional()
  caseStudies?: CaseStudyDto[];

  @ApiPropertyOptional()
  @IsArray() @ValidateNested({ each: true }) @Type(() => FaqItemDto) @IsOptional()
  faq?: FaqItemDto[];
}

export class CreateProposalDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsString() @IsOptional() leadId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() clientId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() projectId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() clientName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() clientEmail?: string;
  @ApiPropertyOptional()
  @ValidateNested() @Type(() => ProposalContentDto) @IsOptional()
  content?: ProposalContentDto;
  @ApiPropertyOptional() @IsDateString() @IsOptional() validUntil?: string;
}

import {
  IsString, IsOptional, IsNumber, IsArray, ValidateNested, IsIn, Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ContractClauseDto {
  @ApiProperty() @IsString() title: string;
  @ApiProperty() @IsString() body: string;
}

export class ContractScopeItemDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsString() @IsOptional() description?: string;
}

export class ContractDeliverableDto {
  @ApiProperty() @IsString() item: string;
  @ApiPropertyOptional() @IsString() @IsOptional() format?: string;
}

export class ContractPaymentMilestoneDto {
  @ApiProperty() @IsString() milestone: string;
  @ApiProperty() @IsNumber() @Min(0) amount: number;
  @ApiPropertyOptional() @IsString() @IsOptional() dueOn?: string;
}

export class ContractContentDto {
  @ApiPropertyOptional() @IsString() @IsOptional() intro?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() projectDescription?: string;
  @ApiPropertyOptional() @IsNumber() @Min(0) @IsOptional() totalAmount?: number;
  @ApiPropertyOptional() @IsNumber() @Min(0) @IsOptional() gstAmount?: number;
  @ApiPropertyOptional() @IsIn(['IGST', 'CGST_SGST', 'EXEMPT']) @IsOptional() gstType?: string;

  @ApiPropertyOptional()
  @IsArray() @ValidateNested({ each: true }) @Type(() => ContractScopeItemDto) @IsOptional()
  scopeItems?: ContractScopeItemDto[];

  @ApiPropertyOptional()
  @IsArray() @ValidateNested({ each: true }) @Type(() => ContractDeliverableDto) @IsOptional()
  deliverables?: ContractDeliverableDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsArray() @IsString({ each: true }) @IsOptional()
  exclusions?: string[];

  @ApiPropertyOptional()
  @IsArray() @ValidateNested({ each: true }) @Type(() => ContractPaymentMilestoneDto) @IsOptional()
  paymentSchedule?: ContractPaymentMilestoneDto[];

  @ApiPropertyOptional()
  @IsArray() @ValidateNested({ each: true }) @Type(() => ContractClauseDto) @IsOptional()
  clauses?: ContractClauseDto[];

  @ApiPropertyOptional() @IsString() @IsOptional() signerName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() signerEmail?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() signerPhone?: string;
}

export class CreateContractDto {
  @ApiProperty() @IsString() title: string;
  @ApiPropertyOptional() @IsString() @IsOptional() proposalId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() clientId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() clientName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() clientEmail?: string;
  @ApiPropertyOptional()
  @ValidateNested() @Type(() => ContractContentDto) @IsOptional()
  content?: ContractContentDto;
}

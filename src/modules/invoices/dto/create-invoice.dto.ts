import {
  IsString, IsOptional, IsNumber, IsEnum, IsArray,
  ValidateNested, IsDateString, Min, Max, IsBoolean, IsInt, IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GstType } from '@prisma/client';

export class LineItemDto {
  @ApiProperty() @IsString() description: string;
  @ApiProperty() @IsNumber() @Min(0) qty: number;
  @ApiProperty() @IsNumber() @Min(0) rate: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(28) gstRate: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hsnSac?: string;
}

export class CreateInvoiceDto {
  @ApiPropertyOptional() @IsString() @IsOptional() title?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() contractId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() clientId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() projectId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() clientName?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() clientEmail?: string;

  @ApiProperty({ type: [LineItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  lineItems: LineItemDto[];

  @ApiPropertyOptional({ enum: GstType })
  @IsEnum(GstType)
  @IsOptional()
  gstType?: GstType;

  @ApiPropertyOptional() @IsNumber() @Min(0) @Max(30) @IsOptional() tdsRate?: number;
  @ApiPropertyOptional() @IsDateString() @IsOptional() dueDate?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() notes?: string;

  @ApiPropertyOptional({ default: 'INR', enum: ['INR', 'USD', 'EUR', 'GBP', 'AED'] })
  @IsOptional()
  @IsIn(['INR', 'USD', 'EUR', 'GBP', 'AED'])
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  exchangeRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lutNumber?: string;

  @ApiPropertyOptional() @IsBoolean() @IsOptional() isRecurring?: boolean;
  @ApiPropertyOptional({ enum: ['MONTHLY', 'QUARTERLY', 'YEARLY', 'WEEKLY'] })
  @IsIn(['MONTHLY', 'QUARTERLY', 'YEARLY', 'WEEKLY']) @IsOptional() recurrenceCycle?: string;
  @ApiPropertyOptional() @IsInt() @Min(1) @Max(28) @IsOptional() recurrenceDay?: number;
  @ApiPropertyOptional() @IsDateString() @IsOptional() recurrenceEndDate?: string;
}

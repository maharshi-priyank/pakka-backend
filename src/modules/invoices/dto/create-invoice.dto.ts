import {
  IsString, IsOptional, IsNumber, IsEnum, IsArray,
  ValidateNested, IsDateString, Min, Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GstType } from '@prisma/client';

export class LineItemDto {
  @ApiProperty() @IsString() description: string;
  @ApiProperty() @IsNumber() @Min(0) qty: number;
  @ApiProperty() @IsNumber() @Min(0) rate: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(28) gstRate: number;
}

export class CreateInvoiceDto {
  @ApiPropertyOptional() @IsString() @IsOptional() title?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() contractId?: string;
  @ApiPropertyOptional() @IsString() @IsOptional() clientId?: string;
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
}

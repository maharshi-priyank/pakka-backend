import { IsEnum, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus } from '@prisma/client';

export class QueryInvoicesDto {
  @ApiPropertyOptional({ enum: InvoiceStatus })
  @IsEnum(InvoiceStatus) @IsOptional()
  status?: InvoiceStatus;

  @ApiPropertyOptional() @IsInt() @Min(1) @Max(200) @Type(() => Number) @IsOptional()
  limit?: number = 50;

  @ApiPropertyOptional() @IsInt() @Min(1) @Type(() => Number) @IsOptional()
  page?: number = 1;
}

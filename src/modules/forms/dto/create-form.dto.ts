import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFormDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Object)
  fields?: Record<string, unknown>[];

  // Set by the creation entry point (Website Leads page), not a user-facing
  // per-form toggle -- see IntakeForm.capturesLeads in schema.prisma.
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  capturesLeads?: boolean;
}

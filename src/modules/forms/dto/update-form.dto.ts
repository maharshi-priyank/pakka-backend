import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateFormDto } from './create-form.dto';

export class UpdateFormDto extends PartialType(CreateFormDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Explicitly redeclared so class-transformer @Type metadata is not lost via PartialType inheritance
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Object)
  fields?: Record<string, unknown>[];
}

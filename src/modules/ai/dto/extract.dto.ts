import { IsString, IsOptional, IsIn } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class ExtractDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  text?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageBase64?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mimeType?: string
}

export class ExtractLeadDto extends ExtractDto {}

export class ExtractProposalDto extends ExtractDto {
  @ApiPropertyOptional({ description: 'Optional pricing context, e.g. "I charge ₹800/hr"' })
  @IsOptional()
  @IsString()
  pricingContext?: string
}

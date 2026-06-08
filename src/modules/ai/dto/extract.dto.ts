import { IsString, IsOptional, IsArray, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
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

export class ChatTurnDto {
  @IsString()
  role!: 'user' | 'model'

  @IsString()
  content!: string
}

export class ChatDto {
  @IsString()
  message!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatTurnDto)
  history?: ChatTurnDto[]
}

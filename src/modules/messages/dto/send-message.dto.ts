import { IsString, IsNotEmpty, IsOptional, IsIn, MaxLength } from 'class-validator'

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50_000)
  body: string

  @IsOptional()
  @IsString()
  subject?: string

  @IsOptional()
  @IsIn(['PROPOSAL', 'INVOICE', 'CONTRACT'])
  attachmentType?: 'PROPOSAL' | 'INVOICE' | 'CONTRACT'

  @IsOptional()
  @IsString()
  attachmentId?: string
}

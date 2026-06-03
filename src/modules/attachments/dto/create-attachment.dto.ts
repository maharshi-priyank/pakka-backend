import { IsString, IsNumber, IsOptional, Min, ValidateIf } from 'class-validator'

export class CreateAttachmentDto {
  @IsOptional() @IsString() projectId?: string
  @IsOptional() @IsString() proposalId?: string
  @IsOptional() @IsString() invoiceId?: string
  @IsOptional() @IsString() clientId?: string

  @IsOptional() @IsString() gateInvoiceId?: string

  @IsString() fileName: string
  @IsString() fileUrl: string
  @IsNumber() @Min(0) fileSize: number
  @IsString() mimeType: string
}

import { IsString, IsOptional } from 'class-validator'
import { ApiPropertyOptional } from '@nestjs/swagger'

export class UpdateWorkspaceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?:              string
  @ApiPropertyOptional() @IsOptional() @IsString() logoUrl?:           string
  @ApiPropertyOptional() @IsOptional() @IsString() businessName?:      string
  @ApiPropertyOptional() @IsOptional() @IsString() gstNumber?:         string
  @ApiPropertyOptional() @IsOptional() @IsString() panNumber?:         string
  @ApiPropertyOptional() @IsOptional() @IsString() businessType?:      string
  @ApiPropertyOptional() @IsOptional() @IsString() bankName?:          string
  @ApiPropertyOptional() @IsOptional() @IsString() bankAccountName?:   string
  @ApiPropertyOptional() @IsOptional() @IsString() bankAccountNumber?: string
  @ApiPropertyOptional() @IsOptional() @IsString() bankIfsc?:          string
  @ApiPropertyOptional() @IsOptional() @IsString() upiId?:             string
  @ApiPropertyOptional() @IsOptional() @IsString() upiQrUrl?:          string
  @ApiPropertyOptional() @IsOptional() @IsString() country?:           string
  @ApiPropertyOptional() @IsOptional() @IsString() currency?:          string
  @ApiPropertyOptional() @IsOptional() @IsString() taxLabel?:          string
  @ApiPropertyOptional() @IsOptional() @IsString() ibanNumber?:        string
  @ApiPropertyOptional() @IsOptional() @IsString() swiftCode?:         string
  @ApiPropertyOptional() @IsOptional() @IsString() routingNumber?:     string
  @ApiPropertyOptional() @IsOptional() @IsString() defaultHsnSac?:     string
  @ApiPropertyOptional() @IsOptional() @IsString() defaultLutNumber?:  string
  @ApiPropertyOptional() @IsOptional() @IsString() emailSignature?:    string
  @ApiPropertyOptional() @IsOptional() @IsString() razorpayKeyId?:     string
  @ApiPropertyOptional() @IsOptional() @IsString() razorpayKeySecret?: string
  @ApiPropertyOptional() @IsOptional() @IsString() razorpayAccountId?: string
}

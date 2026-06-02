import { IsNumber, IsOptional, IsString, Min } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class RecordPaymentDto {
  @ApiProperty({ description: 'Amount received offline (UPI / bank / cash)', example: 90000 })
  @IsNumber()
  @Min(0)
  amountReceived: number

  @ApiProperty({ description: 'TDS deducted by client', example: 10000 })
  @IsNumber()
  @Min(0)
  tdsDeducted: number

  @ApiPropertyOptional({ description: 'Optional note about the payment' })
  @IsString()
  @IsOptional()
  note?: string
}

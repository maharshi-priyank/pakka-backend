import { IsString, IsNotEmpty } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class ConnectWhatsappDto {
  @ApiProperty({ description: 'Embedded Signup OAuth code from Meta' })
  @IsString()
  @IsNotEmpty()
  code: string
}

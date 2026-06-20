import { IsString, IsEmail, IsIn, MinLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

const CATEGORIES = ['General enquiry', 'Product feedback', 'Support', 'Partnership', 'Press'] as const

export class ContactDto {
  @ApiProperty({ example: 'Maharshi' })
  @IsString()
  @MinLength(2)
  name: string

  @ApiProperty({ example: 'hello@example.com' })
  @IsEmail()
  email: string

  @ApiProperty({ enum: CATEGORIES })
  @IsIn(CATEGORIES)
  category: string

  @ApiProperty({ example: 'I had a question about...' })
  @IsString()
  @MinLength(10)
  message: string
}

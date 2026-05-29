import { IsString, IsEmail } from 'class-validator'

export class SendTestEmailDto {
  @IsEmail()
  to: string

  @IsString()
  templateKey: string
}

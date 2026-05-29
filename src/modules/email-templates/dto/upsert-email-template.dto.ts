import { IsString, MinLength, IsNotEmpty } from 'class-validator'

export class UpsertEmailTemplateDto {
  @IsString() @IsNotEmpty()
  subject: string

  @IsString() @MinLength(10)
  bodyHtml: string
}

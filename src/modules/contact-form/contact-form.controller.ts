import { Controller, Post, Body, HttpCode } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { ContactFormService } from './contact-form.service'
import { ContactFormDto } from './contact-form.dto'

@ApiTags('contact')
@Controller('contact')
export class ContactFormController {
  constructor(private readonly contactFormService: ContactFormService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Submit a contact form message (public)' })
  async submit(@Body() dto: ContactFormDto): Promise<{ success: boolean }> {
    await this.contactFormService.send(dto)
    return { success: true }
  }
}

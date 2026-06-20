import { Controller, Post, Body, HttpCode } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { ContactService } from './contact.service'
import { ContactDto } from './contact.dto'

@ApiTags('contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Submit a contact form message (public)' })
  async submit(@Body() dto: ContactDto): Promise<{ success: boolean }> {
    await this.contactService.send(dto)
    return { success: true }
  }
}

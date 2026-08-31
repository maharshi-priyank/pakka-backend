import {
  Controller, Get, Put, Delete, Post, Param, Body,
} from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { EmailTemplatesService } from './email-templates.service'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { UpsertEmailTemplateDto } from './dto/upsert-email-template.dto'
import { SendTestEmailDto } from './dto/send-test-email.dto'
import type { User } from '@prisma/client'

@ApiTags('email-templates')
@ApiBearerAuth()
@Controller('email-templates')
export class EmailTemplatesController {
  constructor(private readonly svc: EmailTemplatesService) {}

  @Get()
  @RequirePermission('MANAGE_WORKSPACE_SETTINGS')
  listTemplates(@CurrentUser() user: User) {
    return this.svc.listTemplates(user.id)
  }

  @Get(':templateKey')
  @RequirePermission('MANAGE_WORKSPACE_SETTINGS')
  getTemplate(@CurrentUser() user: User, @Param('templateKey') key: string) {
    return this.svc.getTemplate(user.id, key)
  }

  @Get(':templateKey/preview')
  @RequirePermission('MANAGE_WORKSPACE_SETTINGS')
  async previewTemplate(@CurrentUser() user: User, @Param('templateKey') key: string) {
    return this.svc.previewTemplate(user.id, key)
  }

  @Put(':templateKey')
  @RequirePermission('MANAGE_WORKSPACE_SETTINGS')
  upsertTemplate(
    @CurrentUser() user: User,
    @Param('templateKey') key: string,
    @Body() dto: UpsertEmailTemplateDto,
  ) {
    return this.svc.upsertTemplate(user.id, key, dto)
  }

  @Delete(':templateKey')
  @RequirePermission('MANAGE_WORKSPACE_SETTINGS')
  resetTemplate(@CurrentUser() user: User, @Param('templateKey') key: string) {
    return this.svc.resetTemplate(user.id, key)
  }

  @Post('send-test')
  @RequirePermission('MANAGE_WORKSPACE_SETTINGS')
  sendTestEmail(@CurrentUser() user: User, @Body() dto: SendTestEmailDto) {
    return this.svc.sendTestEmail(user.id, dto)
  }
}

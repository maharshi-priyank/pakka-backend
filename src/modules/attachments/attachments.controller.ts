import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { AttachmentsService } from './attachments.service'
import { CreateAttachmentDto } from './dto/create-attachment.dto'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { Public } from '../../common/decorators/public.decorator'
import type { User } from '@prisma/client'

@ApiTags('attachments')
@ApiBearerAuth()
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateAttachmentDto) {
    return this.attachmentsService.create(user.id, dto)
  }

  @Get()
  list(
    @CurrentUser() user: User,
    @Query('projectId')  projectId?: string,
    @Query('proposalId') proposalId?: string,
    @Query('invoiceId')  invoiceId?: string,
    @Query('clientId')   clientId?: string,
  ) {
    return this.attachmentsService.list(user.id, { projectId, proposalId, invoiceId, clientId })
  }

  @Delete(':id')
  remove(@CurrentUser() user: User, @Param('id') id: string) {
    return this.attachmentsService.remove(user.id, id)
  }

  // ── Public routes (no auth) ──────────────────────────────────────────────

  @Public()
  @Get('public/proposal/:proposalId')
  listPublicForProposal(@Param('proposalId') proposalId: string) {
    return this.attachmentsService.listPublicForProposal(proposalId)
  }

  @Public()
  @Get('public/invoice/:invoiceId')
  listPublicForInvoice(@Param('invoiceId') invoiceId: string) {
    return this.attachmentsService.listPublicForInvoice(invoiceId)
  }

  @Public()
  @Get('public/portal/:token')
  listPublicForPortal(@Param('token') token: string) {
    return this.attachmentsService.listPublicForPortal(token)
  }
}

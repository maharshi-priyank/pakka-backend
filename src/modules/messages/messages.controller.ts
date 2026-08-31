import { Controller, Get, Post, Patch, Param, Body, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { User } from '@prisma/client'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { resolveWorkspaceId } from '../users/resolve-workspace-id'
import { MessagesService } from './messages.service'
import { SendMessageDto } from './dto/send-message.dto'

@ApiTags('messages')
@ApiBearerAuth()
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  @RequirePermission('VIEW_INBOX')
  listThreads(@CurrentUser() user: User) {
    return this.messagesService.listThreads(resolveWorkspaceId(user))
  }

  @Get('unread-count')
  @RequirePermission('VIEW_INBOX')
  async getUnreadCount(@CurrentUser() user: User) {
    const count = await this.messagesService.getUnreadCount(resolveWorkspaceId(user))
    return { count }
  }

  @Get(':clientId')
  @RequirePermission('VIEW_INBOX')
  getThread(@CurrentUser() user: User, @Param('clientId') clientId: string) {
    return this.messagesService.getThread(resolveWorkspaceId(user), clientId)
  }

  @Post(':clientId')
  @RequirePermission('SEND_MESSAGES')
  sendMessage(
    @CurrentUser() user: User,
    @Param('clientId') clientId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagesService.sendMessage(resolveWorkspaceId(user), clientId, dto)
  }

  @Patch(':clientId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('VIEW_INBOX')
  markRead(@CurrentUser() user: User, @Param('clientId') clientId: string) {
    return this.messagesService.markRead(resolveWorkspaceId(user), clientId)
  }

  // ── Contact-based messaging (Phase C — contacts without a Client record) ──────

  @Get('contact/:contactId')
  @RequirePermission('VIEW_INBOX')
  getThreadByContact(@CurrentUser() user: User, @Param('contactId') contactId: string) {
    return this.messagesService.getThreadByContactId(resolveWorkspaceId(user), contactId)
  }

  @Post('contact/:contactId')
  @RequirePermission('SEND_MESSAGES')
  sendMessageToContact(
    @CurrentUser() user: User,
    @Param('contactId') contactId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagesService.sendMessageToContact(resolveWorkspaceId(user), contactId, dto)
  }

  @Patch('contact/:contactId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('VIEW_INBOX')
  markReadByContact(@CurrentUser() user: User, @Param('contactId') contactId: string) {
    return this.messagesService.markReadByContactId(resolveWorkspaceId(user), contactId)
  }
}

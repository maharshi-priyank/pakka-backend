import { Controller, Get, Post, Patch, Param, Body, HttpCode, HttpStatus } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { User } from '@prisma/client'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { effectiveUserId } from '../users/effective-user-id'
import { MessagesService } from './messages.service'
import { SendMessageDto } from './dto/send-message.dto'

@ApiTags('messages')
@ApiBearerAuth()
@Controller('messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  listThreads(@CurrentUser() user: User) {
    return this.messagesService.listThreads(effectiveUserId(user))
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: User) {
    const count = await this.messagesService.getUnreadCount(effectiveUserId(user))
    return { count }
  }

  @Get(':clientId')
  getThread(@CurrentUser() user: User, @Param('clientId') clientId: string) {
    return this.messagesService.getThread(effectiveUserId(user), clientId)
  }

  @Post(':clientId')
  sendMessage(
    @CurrentUser() user: User,
    @Param('clientId') clientId: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagesService.sendMessage(effectiveUserId(user), clientId, dto)
  }

  @Patch(':clientId/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(@CurrentUser() user: User, @Param('clientId') clientId: string) {
    return this.messagesService.markRead(effectiveUserId(user), clientId)
  }
}

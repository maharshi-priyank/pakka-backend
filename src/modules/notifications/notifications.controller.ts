import { Controller, Get, Patch, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findAll(@CurrentUser() user: User) {
    return this.notificationsService.findAll(user.id);
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: User) {
    const count = await this.notificationsService.getUnreadCount(user.id);
    return { count };
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  markAllRead(@CurrentUser() user: User) {
    return this.notificationsService.markAllRead(user.id);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  markRead(@CurrentUser() user: User, @Param('id') id: string) {
    return this.notificationsService.markRead(user.id, id);
  }
}

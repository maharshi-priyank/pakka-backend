import { Controller, Get, Post, Patch, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

interface SubscribeDto {
  endpoint:  string
  keys:      { p256dh: string; auth: string }
  userAgent?: string
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly push:                  PushService,
    private readonly prisma:                PrismaService,
  ) {}

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

  // ── Push notifications ──────────────────────────────────────────────────────

  @Get('push/public-key')
  getPushPublicKey() {
    return { publicKey: this.push.getPublicKey() };
  }

  @Post('push/subscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  async subscribe(@CurrentUser() user: User, @Body() body: SubscribeDto) {
    if (!body?.endpoint || !body?.keys?.p256dh || !body?.keys?.auth) {
      return; // silently ignore malformed
    }

    await this.prisma.pushSubscription.upsert({
      where:  { endpoint: body.endpoint },
      update: {
        workspaceId: user.id,
        p256dh:    body.keys.p256dh,
        auth:      body.keys.auth,
        userAgent: body.userAgent ?? null,
      },
      create: {
        workspaceId: user.id,
        endpoint:  body.endpoint,
        p256dh:    body.keys.p256dh,
        auth:      body.keys.auth,
        userAgent: body.userAgent ?? null,
      },
    });
  }

  @Delete('push/subscribe')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unsubscribe(@CurrentUser() user: User, @Body() body: { endpoint: string }) {
    if (!body?.endpoint) return;
    await this.prisma.pushSubscription.deleteMany({
      where: { workspaceId: user.id, endpoint: body.endpoint },
    });
  }

  @Post('push/test')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sendTest(@CurrentUser() user: User) {
    await this.push.sendToUser(user.id, {
      title: 'Push notifications are on',
      body:  'You\'ll get pinged when clients pay, sign, or open your work.',
      type:  'test',
      url:   '/app/dashboard',
    });
  }
}

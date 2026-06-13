import { Module } from '@nestjs/common'
import { MessagesController } from './messages.controller'
import { MessagesService } from './messages.service'
import { PrismaModule } from '../../prisma/prisma.module'
import { NotificationsModule } from '../notifications/notifications.module'
import { AutomationsModule } from '../automations/automations.module'

@Module({
  imports:     [PrismaModule, NotificationsModule, AutomationsModule],
  controllers: [MessagesController],
  providers:   [MessagesService],
  exports:     [MessagesService],
})
export class MessagesModule {}

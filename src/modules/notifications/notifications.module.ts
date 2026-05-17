import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsListener } from './notifications.listener';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports:     [PrismaModule],
  controllers: [NotificationsController],
  providers:   [NotificationsService, NotificationsListener],
  exports:     [NotificationsService],
})
export class NotificationsModule {}

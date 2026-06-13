import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { MessagesModule } from '../messages/messages.module';

@Module({
  imports:     [MessagesModule],
  controllers: [PortalController],
  providers:   [PortalService],
})
export class PortalModule {}

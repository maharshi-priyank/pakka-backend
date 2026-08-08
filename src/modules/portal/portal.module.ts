import { Module } from '@nestjs/common';
import { PortalController } from './portal.controller';
import { PortalService } from './portal.service';
import { MessagesModule } from '../messages/messages.module';
import { ChangeRequestsModule } from '../change-requests/change-requests.module';
import { ApprovalRequestsModule } from '../approval-requests/approval-requests.module';

@Module({
  imports:     [MessagesModule, ChangeRequestsModule, ApprovalRequestsModule],
  controllers: [PortalController],
  providers:   [PortalService],
})
export class PortalModule {}

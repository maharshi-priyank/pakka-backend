import { Module } from '@nestjs/common'
import { PrismaModule } from '../../prisma/prisma.module'
import { SharedModule } from '../shared/shared.module'
import { ApprovalRequestsController } from './approval-requests.controller'
import { ApprovalRequestsService } from './approval-requests.service'

@Module({
  imports:     [PrismaModule, SharedModule],
  controllers: [ApprovalRequestsController],
  providers:   [ApprovalRequestsService],
  exports:     [ApprovalRequestsService],
})
export class ApprovalRequestsModule {}

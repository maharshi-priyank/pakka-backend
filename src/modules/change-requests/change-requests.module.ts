import { Module } from '@nestjs/common';
import { ChangeRequestsService } from './change-requests.service';
import { ChangeRequestsController } from './change-requests.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports:     [PrismaModule],
  controllers: [ChangeRequestsController],
  providers:   [ChangeRequestsService],
  exports:     [ChangeRequestsService],
})
export class ChangeRequestsModule {}

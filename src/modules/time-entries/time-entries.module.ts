import { Module } from '@nestjs/common';
import { TimeEntriesController } from './time-entries.controller';
import { TimeEntriesService } from './time-entries.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports:     [PrismaModule, InvoicesModule],
  controllers: [TimeEntriesController],
  providers:   [TimeEntriesService],
  exports:     [TimeEntriesService],
})
export class TimeEntriesModule {}

import { Module } from '@nestjs/common';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports:     [PrismaModule, InvoicesModule],
  controllers: [ProposalsController],
  providers:   [ProposalsService],
  exports:     [ProposalsService],
})
export class ProposalsModule {}

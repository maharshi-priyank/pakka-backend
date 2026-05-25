import { Module } from '@nestjs/common';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { InvoicesModule } from '../invoices/invoices.module';

@Module({
  imports:     [PrismaModule, InvoicesModule],
  controllers: [ExpensesController],
  providers:   [ExpensesService],
  exports:     [ExpensesService],
})
export class ExpensesModule {}

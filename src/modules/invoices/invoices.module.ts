import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { InvoiceTemplatesModule } from '../invoice-templates/invoice-templates.module';

@Module({
  imports: [PrismaModule, InvoiceTemplatesModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}

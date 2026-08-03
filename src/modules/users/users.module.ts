import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AutomationsModule } from '../automations/automations.module';
import { WorkspacesModule } from '../workspaces/workspaces.module';
import { ContractTemplatesModule } from '../contract-templates/contract-templates.module';
import { InvoiceTemplatesModule } from '../invoice-templates/invoice-templates.module';
import { ProductEventsModule } from '../product-events/product-events.module';

@Module({
  imports:     [AutomationsModule, WorkspacesModule, ContractTemplatesModule, InvoiceTemplatesModule, ProductEventsModule],
  controllers: [UsersController],
  providers:   [UsersService],
  exports:     [UsersService],
})
export class UsersModule {}

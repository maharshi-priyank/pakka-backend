import { Module } from '@nestjs/common';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ContractTemplatesModule } from '../contract-templates/contract-templates.module';

@Module({
  // U5/KTD3: ContractTemplatesModule is imported here (not just registered
  // as a sibling in app.module.ts) so createFromProposal() can inject
  // ContractTemplatesService -- Nest modules don't share providers across
  // siblings without an explicit import of the exporting module.
  imports:     [PrismaModule, ContractTemplatesModule],
  controllers: [ContractsController],
  providers:   [ContractsService],
  exports:     [ContractsService],
})
export class ContractsModule {}

import { Module } from '@nestjs/common';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { ContractTemplatesModule } from '../contract-templates/contract-templates.module';
import { SharedModule } from '../shared/shared.module';

@Module({
  // U5/KTD3: ContractTemplatesModule is imported here (not just registered
  // as a sibling in app.module.ts) so createFromProposal() can inject
  // ContractTemplatesService -- Nest modules don't share providers across
  // siblings without an explicit import of the exporting module.
  // SharedModule provides OtpService (bcrypt hashing, expiry, email delivery).
  imports:     [PrismaModule, ContractTemplatesModule, SharedModule],
  controllers: [ContractsController],
  providers:   [ContractsService],
  exports:     [ContractsService],
})
export class ContractsModule {}

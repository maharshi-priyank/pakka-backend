import { Module } from '@nestjs/common';
import { LeadVaultController } from './lead-vault.controller';
import { LeadVaultService } from './lead-vault.service';
import { LeadProvidersModule } from '../lead-providers/lead-providers.module';

@Module({
  imports: [LeadProvidersModule],
  controllers: [LeadVaultController],
  providers: [LeadVaultService],
  exports: [LeadVaultService],
})
export class LeadVaultModule {}

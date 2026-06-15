import { Module } from '@nestjs/common';
import { LeadCampaignsController } from './lead-campaigns.controller';
import { LeadCampaignsService } from './lead-campaigns.service';
import { LeadVaultModule } from '../lead-vault/lead-vault.module';
import { LeadProvidersModule } from '../lead-providers/lead-providers.module';

@Module({
  imports: [LeadVaultModule, LeadProvidersModule],
  controllers: [LeadCampaignsController],
  providers: [LeadCampaignsService],
})
export class LeadCampaignsModule {}

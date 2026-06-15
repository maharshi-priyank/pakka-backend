import { Module } from '@nestjs/common';
import { DiscoveredLeadsController } from './discovered-leads.controller';
import { DiscoveredLeadsService } from './discovered-leads.service';

@Module({
  controllers: [DiscoveredLeadsController],
  providers: [DiscoveredLeadsService],
})
export class DiscoveredLeadsModule {}

import { Module } from '@nestjs/common';
import { ProposalTemplatesController } from './proposal-templates.controller';
import { ProposalTemplatesService } from './proposal-templates.service';

@Module({
  controllers: [ProposalTemplatesController],
  providers:   [ProposalTemplatesService],
  exports:     [ProposalTemplatesService],
})
export class ProposalTemplatesModule {}

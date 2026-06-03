import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ProposalStatus } from '@prisma/client';
import { CreateProposalDto } from './create-proposal.dto';

export class UpdateProposalDto extends PartialType(CreateProposalDto) {
  @IsOptional()
  @IsEnum(ProposalStatus)
  status?: ProposalStatus;

  @IsOptional()
  @IsBoolean()
  hidePricingTable?: boolean;
}

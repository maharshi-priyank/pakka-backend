import { IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SendProposalDto {
  @ApiPropertyOptional({ description: 'Require the client to enter an OTP before the view is tracked (R7)' })
  @IsOptional()
  @IsBoolean()
  otpGated?: boolean;
}

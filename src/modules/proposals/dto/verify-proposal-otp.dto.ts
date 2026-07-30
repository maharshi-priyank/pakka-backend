import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyProposalOtpDto {
  @ApiProperty({ description: '6-digit OTP shown to the freelancer at send time' })
  @IsString()
  @Length(6, 6)
  otp: string;
}

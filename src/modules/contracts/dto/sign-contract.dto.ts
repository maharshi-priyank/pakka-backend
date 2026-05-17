import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignContractDto {
  @ApiProperty({ description: '6-digit OTP sent to the signer' })
  @IsString()
  @Length(6, 6)
  otp: string;
}

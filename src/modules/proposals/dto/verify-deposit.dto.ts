import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyDepositDto {
  @ApiProperty() @IsString() orderId:   string;
  @ApiProperty() @IsString() paymentId: string;
  @ApiProperty() @IsString() signature: string;
}

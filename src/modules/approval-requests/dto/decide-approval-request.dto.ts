import { IsEnum, IsOptional, IsString } from 'class-validator'

export class DecideApprovalRequestDto {
  @IsEnum(['APPROVE', 'REJECT', 'REQUEST_REVISION'])
  action: string

  @IsString()
  @IsOptional()
  otp?: string

  @IsString()
  @IsOptional()
  decisionNote?: string
}

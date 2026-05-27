import { IsArray, IsEmail, IsIn, IsISO8601, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateMeetingDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  agenda?: string;

  @IsISO8601()
  scheduledAt: string;

  @IsNumber()
  @Min(5)
  @IsOptional()
  durationMins?: number;

  @IsString()
  @IsOptional()
  leadId?: string;

  @IsString()
  @IsOptional()
  clientId?: string;

  @IsArray()
  @IsEmail({}, { each: true })
  @IsOptional()
  guestEmails?: string[];

  @IsString()
  @IsIn(['google', 'outlook'])
  @IsOptional()
  provider?: 'google' | 'outlook';
}

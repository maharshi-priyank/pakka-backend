import { IsEmail, IsOptional, IsString, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ConvertLeadToContactDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?:    string;
  @ApiPropertyOptional() @IsOptional() @IsEmail()  email?:   string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?:   string;
  @ApiPropertyOptional() @IsOptional() @IsString() company?: string;

  // Required by Contact but captured by neither Lead nor the form -- default
  // from the workspace's own country/currency when present (KD5); the
  // frontend collects these when the workspace has no default.
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;

  @ApiPropertyOptional({ enum: ['INR', 'USD', 'EUR', 'GBP', 'AED'] })
  @IsOptional()
  @IsIn(['INR', 'USD', 'EUR', 'GBP', 'AED'])
  currency?: string;
}

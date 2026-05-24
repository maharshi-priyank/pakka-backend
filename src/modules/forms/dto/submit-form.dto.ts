import { IsString, IsOptional, IsEmail, IsObject } from 'class-validator';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';

export class SubmitFormDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  respondentName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  respondentEmail?: string;

  @ApiProperty()
  @IsObject()
  answers: Record<string, unknown>;
}

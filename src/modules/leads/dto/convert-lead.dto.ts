import { IsBoolean, IsEmail, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ConvertLeadDto {
  @ApiPropertyOptional() @IsOptional() @IsString()  name?:            string;
  @ApiPropertyOptional() @IsOptional() @IsEmail()   email?:           string;
  @ApiPropertyOptional() @IsOptional() @IsString()  phone?:           string;
  @ApiPropertyOptional() @IsOptional() @IsString()  company?:         string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean() createProject?:   boolean;
  @ApiPropertyOptional() @IsOptional() @IsString()  projectName?:     string;
  @ApiPropertyOptional() @IsOptional() @IsNumber()  projectBudget?:   number;
  @ApiPropertyOptional() @IsOptional() @IsString()  projectStartDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString()  projectEndDate?:  string;
}

import { IsString, IsOptional, IsNumber, IsDateString, Min, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTimeEntryDto {
  @ApiPropertyOptional() @IsString()    @IsOptional() clientId?:     string;
  @ApiPropertyOptional() @IsString()    @IsOptional() description?:  string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() date?:        string;
  @ApiPropertyOptional() @IsNumber() @Min(1) @IsOptional() durationMins?: number;
  @ApiPropertyOptional() @IsNumber() @Min(0) @IsOptional() hourlyRate?:   number;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isBilled?:  boolean;
  @ApiPropertyOptional() @IsString()  @IsOptional() invoiceId?: string;
}

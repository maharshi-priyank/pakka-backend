import { IsString, IsOptional, IsNumber, IsDateString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTimeEntryDto {
  @ApiPropertyOptional() @IsString()  @IsOptional() clientId?:    string;
  @ApiPropertyOptional() @IsString()  @IsOptional() projectId?:   string;
  @ApiProperty()         @IsString()               description:  string;
  @ApiProperty()         @IsDateString()            date:         string;
  @ApiProperty()         @IsNumber() @Min(1)        durationMins: number;
  @ApiPropertyOptional() @IsNumber() @Min(0) @IsOptional() hourlyRate?: number;
}

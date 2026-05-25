import { IsString, IsOptional, IsBoolean, IsDateString } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryTimeEntriesDto {
  @ApiPropertyOptional() @IsString()    @IsOptional() clientId?:  string;
  @ApiPropertyOptional() @IsString()    @IsOptional() projectId?: string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() from?:   string;
  @ApiPropertyOptional() @IsDateString() @IsOptional() to?:     string;
  @ApiPropertyOptional()
  @Transform(({ value }) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean() @IsOptional() isBilled?: boolean;
}

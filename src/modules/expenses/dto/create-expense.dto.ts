import { IsString, IsOptional, IsNumber, IsDateString, Min, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateExpenseDto {
  @ApiPropertyOptional() @IsString()    @IsOptional() clientId?:    string;
  @ApiPropertyOptional() @IsString()    @IsOptional() projectId?:   string;
  @ApiProperty()         @IsString()               category:      string;
  @ApiProperty()         @IsString()               description:   string;
  @ApiProperty()         @IsNumber() @Min(0)        amount:        number;
  @ApiProperty()         @IsDateString()            date:          string;
  @ApiPropertyOptional() @IsString()    @IsOptional() receiptUrl?:  string;
  @ApiPropertyOptional() @IsBoolean()  @IsOptional() isBillable?:  boolean;
}

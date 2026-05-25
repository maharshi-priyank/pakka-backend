import { IsString, IsOptional, IsNumber, IsDateString, Min, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateExpenseDto {
  @ApiPropertyOptional() @IsString()    @IsOptional() clientId?:    string;
  @ApiPropertyOptional() @IsString()    @IsOptional() category?:    string;
  @ApiPropertyOptional() @IsString()    @IsOptional() description?: string;
  @ApiPropertyOptional() @IsNumber() @Min(0) @IsOptional() amount?: number;
  @ApiPropertyOptional() @IsDateString() @IsOptional() date?:       string;
  @ApiPropertyOptional() @IsString()    @IsOptional() receiptUrl?:  string;
  @ApiPropertyOptional() @IsBoolean()  @IsOptional() isBillable?:  boolean;
  @ApiPropertyOptional() @IsBoolean()  @IsOptional() isBilled?:    boolean;
  @ApiPropertyOptional() @IsString()  @IsOptional()  invoiceId?:   string;
}

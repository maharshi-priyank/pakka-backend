import { IsString, IsOptional, IsArray, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CampaignFiltersDto {
  @ApiPropertyOptional() @IsOptional() @IsString() niche?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() jobTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() companySize?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() keyword?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(10) @Max(500) targetCount?: number;
}

export class CreateCampaignDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) providers: string[];
  @ApiPropertyOptional() @IsOptional() filters?: CampaignFiltersDto;
}

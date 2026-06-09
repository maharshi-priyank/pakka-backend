import { IsString, IsBoolean, IsOptional, IsArray, MaxLength, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePublicProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  publicProfileEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, { message: 'Username may only contain lowercase letters, numbers, and hyphens' })
  @MaxLength(40)
  publicUsername?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  publicBio?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  publicCity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  publicWhatsapp?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  publicLanguages?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  publicSkills?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  publicServices?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  publicPortfolio?: unknown;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  publicAccentColor?: string;
}

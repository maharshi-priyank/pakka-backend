import { IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsObject()
  content: Record<string, unknown>;

  @IsNumber()
  @Min(0)
  @IsOptional()
  totalAmount?: number;
}

import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class FromInvoiceDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;
}

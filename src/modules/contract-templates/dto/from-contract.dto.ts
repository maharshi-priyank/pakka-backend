import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class FromContractDto {
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

import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, Type } from 'class-validator';
import { Transform } from 'class-transformer';

export class AdminUserSearchDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 25;
}

import { IsOptional, IsString, IsDateString, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';

export class AuditQueryDto {
  @ApiProperty({ required: false })
  @IsOptional() @IsString() adminId?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() targetType?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() targetId?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsString() action?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsDateString() from?: string;

  @ApiProperty({ required: false })
  @IsOptional() @IsDateString() to?: string;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;

  @ApiProperty({ required: false, default: 50 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number = 50;
}

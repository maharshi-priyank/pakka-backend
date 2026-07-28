import { IsOptional, IsEnum, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ContactStage } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryContactsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ContactStage })
  @IsOptional()
  @IsEnum(ContactStage)
  stage?: ContactStage;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  includeArchived?: boolean = false;
}

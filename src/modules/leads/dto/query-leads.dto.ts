import { IsOptional, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { LeadStage } from '@prisma/client';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export class QueryLeadsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: LeadStage })
  @IsOptional()
  @IsEnum(LeadStage)
  stage?: LeadStage;
}

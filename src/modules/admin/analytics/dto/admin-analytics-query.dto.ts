import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';

export type AnalyticsBucket = 'day' | 'week' | 'month' | 'auto';

export class AdminAnalyticsQueryDto {
  @ApiPropertyOptional({ description: 'Inclusive ISO date/time.' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Exclusive ISO date/time.' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    enum: ['day', 'week', 'month', 'auto'],
    default: 'auto',
  })
  @IsOptional()
  @IsIn(['day', 'week', 'month', 'auto'])
  bucket: AnalyticsBucket = 'auto';
}

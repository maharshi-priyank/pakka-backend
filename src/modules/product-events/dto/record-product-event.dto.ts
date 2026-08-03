import { IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PRODUCT_EVENT_NAMES, type ProductEventName } from '../product-events.contract';

export class RecordProductEventDto {
  @ApiProperty({ enum: PRODUCT_EVENT_NAMES })
  @IsIn(PRODUCT_EVENT_NAMES)
  eventName: ProductEventName;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(3)
  eventVersion?: number;

  @ApiPropertyOptional({ description: 'Client occurrence time; must be close to receipt time.' })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @ApiPropertyOptional({ maxLength: 128 })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  workspaceId?: string;

  /** Accepted for compatibility with older clients; the server always uses the JWT actor. */
  @ApiPropertyOptional({ writeOnly: true })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  userId?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  properties?: Record<string, unknown>;
}

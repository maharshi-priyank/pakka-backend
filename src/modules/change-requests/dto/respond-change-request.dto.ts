import { IsString, IsNotEmpty, IsOptional, IsEnum, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum RespondChangeRequestType {
  IN_SCOPE = 'IN_SCOPE',
  NOT_FEASIBLE = 'NOT_FEASIBLE',
  ADDITIONAL_COST = 'ADDITIONAL_COST',
}

export class RespondChangeRequestDto {
  @IsEnum(RespondChangeRequestType) responseType: RespondChangeRequestType;
  @IsString() @IsOptional() note?: string;
  @Type(() => Number) @IsNumber() @Min(0) @IsOptional() amount?: number;
  @IsString() @IsOptional() description?: string;
}

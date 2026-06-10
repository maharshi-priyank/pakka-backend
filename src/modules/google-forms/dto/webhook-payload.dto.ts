import { IsOptional, IsString, IsObject } from 'class-validator';

export class WebhookPayloadDto {
  @IsOptional()
  @IsString()
  respondentEmail?: string;

  @IsObject()
  answers: Record<string, string | string[]>;
}

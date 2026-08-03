import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// capturesLeads is intentionally NOT a creatable field here -- the one
// lead-capture form is created only by FormsService.seedLeadCaptureForm(),
// never through this generic create path. See IntakeForm.capturesLeads in
// schema.prisma.
export class CreateFormDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Object)
  fields?: Record<string, unknown>[];
}

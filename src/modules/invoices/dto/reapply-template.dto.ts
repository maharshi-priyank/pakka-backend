import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReapplyTemplateDto {
  @ApiProperty({ description: 'Id of the Invoice template to re-apply' })
  @IsString()
  @IsNotEmpty()
  templateId: string;
}

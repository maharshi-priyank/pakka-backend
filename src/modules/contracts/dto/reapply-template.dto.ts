import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReapplyTemplateDto {
  @ApiProperty({ description: 'ID of the Contract template to re-apply' })
  @IsString()
  @IsNotEmpty()
  templateId: string;
}

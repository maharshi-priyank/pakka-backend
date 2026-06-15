import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SaveKeyDto {
  @ApiProperty()
  @IsString()
  @MinLength(4)
  key: string;
}

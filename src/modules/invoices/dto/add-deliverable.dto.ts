import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, Min } from 'class-validator';

export class AddDeliverableDto {
  @ApiProperty() @IsString() fileName: string;
  @ApiProperty() @IsString() fileUrl:  string;
  @ApiProperty() @IsNumber() @Min(0)   fileSize: number;
  @ApiProperty() @IsString() mimeType: string;
}

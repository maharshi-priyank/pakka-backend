import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateChangeRequestDto {
  @IsString() @IsNotEmpty() description: string;
  @IsString() @IsOptional() attachmentId?: string;
}

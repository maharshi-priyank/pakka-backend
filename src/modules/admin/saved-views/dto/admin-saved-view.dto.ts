import { IsObject, IsString, MaxLength, MinLength } from 'class-validator';

export class AdminSavedViewDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  page!: string;

  @IsObject()
  filters!: Record<string, unknown>;
}

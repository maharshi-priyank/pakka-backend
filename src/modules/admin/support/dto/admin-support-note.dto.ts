import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export type SupportNoteTargetType = 'user' | 'workspace';

export class AdminSupportNoteTargetDto {
  @IsString()
  @IsIn(['user', 'workspace'])
  targetType!: SupportNoteTargetType;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  targetId!: string;
}

export class CreateAdminSupportNoteDto extends AdminSupportNoteTargetDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  body!: string;
}

export class AdminSupportNoteQueryDto extends AdminSupportNoteTargetDto {
}

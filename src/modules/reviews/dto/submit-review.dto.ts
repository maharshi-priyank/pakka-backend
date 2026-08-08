import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator'

export class SubmitReviewDto {
  @IsInt() @Min(1) @Max(5) rating: number
  @IsString() @IsOptional() body?: string
  @IsString() @IsOptional() authorName?: string
}

import { IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, Min } from 'class-validator';

// KTD6: `content` holds { notes: string, lineItems?: LineItemDto[] } --
// `notes` is the boilerplate field, `lineItems` an optional starting point
// for from-scratch creation only. Kept as a freeform object at the DTO
// layer (mirroring proposal-templates' CreateTemplateDto) since it's
// persisted straight into a Prisma Json column.
export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsObject()
  content: Record<string, unknown>;

  @IsNumber()
  @Min(0)
  @IsOptional()
  totalAmount?: number;
}

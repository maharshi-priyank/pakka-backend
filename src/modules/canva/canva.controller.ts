import { Controller, Get, Param, Query } from '@nestjs/common';
import { CanvaService } from './canva.service.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { User } from '@prisma/client';

@Controller('canva')
export class CanvaController {
  constructor(private readonly canva: CanvaService) {}

  @Get('designs')
  getDesigns(
    @CurrentUser() user: User,
    @Query('q') query?: string,
    @Query('continuation') continuation?: string,
  ) {
    return this.canva.getDesigns(user.id, query);
  }

  @Get('designs/:id')
  getDesign(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ) {
    return this.canva.getDesign(user.id, id);
  }
}

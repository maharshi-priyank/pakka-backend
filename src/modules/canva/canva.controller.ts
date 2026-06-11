import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
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

  // Export a Canva design as PDF, upload to Supabase, return a public file URL.
  // The returned URL is accessible by anyone (clients, portals) — no Canva account needed.
  @Post('designs/:id/export')
  async exportDesign(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body('title') title: string,
  ) {
    const fileUrl = await this.canva.exportDesignAsPdf(user.id, id, title ?? 'Canva Design');
    return { data: { fileUrl } };
  }
}

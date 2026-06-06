import { Controller, Post, Get, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ClickUpService } from './clickup.service.js';
import { User } from '@prisma/client';

@ApiTags('clickup')
@ApiBearerAuth()
@Controller('clickup')
@UseGuards(JwtAuthGuard)
export class ClickUpController {
  constructor(private readonly clickUp: ClickUpService) {}

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync ClickUp data (lists → projects, time entries, members → clients)' })
  async sync(@CurrentUser() user: User) {
    const result = await this.clickUp.syncAll(user.id);
    return { synced: result };
  }

  @Get('preview')
  @ApiOperation({ summary: 'Preview ClickUp lists and members without syncing' })
  async preview(@CurrentUser() user: User) {
    return this.clickUp.previewLists(user.id);
  }
}

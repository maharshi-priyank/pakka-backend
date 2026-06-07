import { Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { CanvaAuthService } from './canva-auth.service.js';
import { User } from '@prisma/client';

@Controller('auth/canva')
@UseGuards(JwtAuthGuard)
export class CanvaAuthController {
  constructor(
    private readonly canvaAuth: CanvaAuthService,
    private readonly config:    ConfigService,
  ) {}

  @Get('connect')
  connect(@CurrentUser() user: User) {
    const authUrl = this.canvaAuth.getAuthUrl(user.id);
    return { authUrl };
  }

  @Public()
  @Get('callback')
  async callback(
    @Query('code')  code:  string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    await this.canvaAuth.handleCallback(code, state);
    const appUrl = this.config.get<string>('appUrl');
    return res.redirect(`${appUrl}/app/settings?tab=integrations&canvaConnected=true`);
  }

  @Post('disconnect')
  async disconnect(@CurrentUser() user: User) {
    await this.canvaAuth.disconnect(user.id);
    return { success: true };
  }
}

import { Controller, Get, Logger, Post, Query, Res, UseGuards } from '@nestjs/common';
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
  private readonly logger = new Logger(CanvaAuthController.name);

  constructor(
    private readonly canvaAuth: CanvaAuthService,
    private readonly config:    ConfigService,
  ) {}

  @Get('connect')
  async connect(@CurrentUser() user: User) {
    const authUrl = await this.canvaAuth.getAuthUrl(user.id);
    return { authUrl };
  }

  @Public()
  @Get('callback')
  async callback(
    @Query('code')  code:  string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const appUrl = this.config.get<string>('appUrl') ?? 'http://localhost:5173';
    try {
      await this.canvaAuth.handleCallback(code, state);
      return res.redirect(`${appUrl}/settings?tab=integrations&canvaConnected=true`);
    } catch (err: any) {
      this.logger.error('Canva callback failed', err?.message);
      return res.redirect(`${appUrl}/settings?tab=integrations&canvaError=true`);
    }
  }

  @Post('disconnect')
  async disconnect(@CurrentUser() user: User) {
    await this.canvaAuth.disconnect(user.id);
    return { success: true };
  }
}

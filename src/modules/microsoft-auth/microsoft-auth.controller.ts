import { Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { MicrosoftAuthService } from './microsoft-auth.service.js';
import { User } from '@prisma/client';

@Controller('auth/microsoft')
@UseGuards(JwtAuthGuard)
export class MicrosoftAuthController {
  constructor(
    private readonly msAuth: MicrosoftAuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('connect')
  connect(@CurrentUser() user: User) {
    const authUrl = this.msAuth.getAuthUrl(user.id);
    return { authUrl };
  }

  @Public()
  @Get('callback')
  async callback(
    @Query('code')  code:  string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    await this.msAuth.handleCallback(code, state);
    const appUrl = this.config.get<string>('appUrl');
    return res.redirect(`${appUrl}/settings?tab=integrations&outlookConnected=true`);
  }

  @Post('disconnect')
  async disconnect(@CurrentUser() user: User) {
    await this.msAuth.disconnectOutlook(user.id);
    return { success: true };
  }
}

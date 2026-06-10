import { Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { GoogleAuthService } from './google-auth.service';
import { User } from '@prisma/client';

@Controller('auth/google')
@UseGuards(JwtAuthGuard)
export class GoogleAuthController {
  constructor(
    private readonly googleAuth: GoogleAuthService,
    private readonly config:     ConfigService,
  ) {}

  @Get('connect')
  connect(@CurrentUser() user: User) {
    const authUrl = this.googleAuth.getAuthUrl(user.id);
    return { authUrl };
  }

  @Get('connect-docs')
  connectDocs(@CurrentUser() user: User) {
    const authUrl = this.googleAuth.getDocsAuthUrl(user.id);
    return { authUrl };
  }

  @Public()
  @Get('callback')
  async callback(
    @Query('code')  code:  string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const { type } = await this.googleAuth.handleCallback(code, state);
    const appUrl   = this.config.get<string>('appUrl');
    const param    = type === 'docs'   ? 'googleDocsConnected=true'
                   : type === 'sheets' ? 'googleSheetsConnected=true'
                   : 'googleConnected=true';
    return res.redirect(`${appUrl}/settings?tab=integrations&${param}`);
  }

  @Post('disconnect')
  async disconnect(@CurrentUser() user: User) {
    await this.googleAuth.disconnectCalendar(user.id);
    return { success: true };
  }

  @Post('disconnect-docs')
  async disconnectDocs(@CurrentUser() user: User) {
    await this.googleAuth.disconnectDocs(user.id);
    return { success: true };
  }

  @Get('connect-sheets')
  connectSheets(@CurrentUser() user: User) {
    const authUrl = this.googleAuth.getSheetsAuthUrl(user.id);
    return { authUrl };
  }

  @Post('disconnect-sheets')
  async disconnectSheets(@CurrentUser() user: User) {
    await this.googleAuth.disconnectSheets(user.id);
    return { success: true };
  }
}

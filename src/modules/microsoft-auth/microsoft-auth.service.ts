import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service.js';

const SCOPES = [
  'openid',
  'email',
  'offline_access',
  'Calendars.ReadWrite',
];

interface TokenResponse {
  access_token:  string;
  refresh_token: string;
  expires_in:    number;
  token_type:    string;
}

@Injectable()
export class MicrosoftAuthService {
  private readonly logger = new Logger(MicrosoftAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly users:  UsersService,
  ) {}

  getAuthUrl(userId: string): string {
    const clientId    = this.config.get<string>('microsoft.clientId')!;
    const redirectUri = this.config.get<string>('microsoft.redirectUri')!;

    const params = new URLSearchParams({
      client_id:     clientId,
      response_type: 'code',
      redirect_uri:  redirectUri,
      scope:         SCOPES.join(' '),
      response_mode: 'query',
      state:         userId,
    });

    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async handleCallback(code: string, userId: string): Promise<void> {
    const clientId     = this.config.get<string>('microsoft.clientId')!;
    const clientSecret = this.config.get<string>('microsoft.clientSecret')!;
    const redirectUri  = this.config.get<string>('microsoft.redirectUri')!;

    const body = new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      code,
      redirect_uri:  redirectUri,
      grant_type:    'authorization_code',
      scope:         SCOPES.join(' '),
    });

    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });

    const json = await res.json() as TokenResponse & { error?: string; error_description?: string };

    if (!res.ok || json.error) {
      this.logger.error(`Microsoft token exchange failed: ${json.error_description ?? json.error}`);
      throw new UnauthorizedException(`Microsoft auth failed: ${json.error_description ?? json.error}`);
    }

    if (!json.access_token || !json.refresh_token) {
      throw new UnauthorizedException('Microsoft did not return access/refresh tokens');
    }

    const expiresAt = new Date(Date.now() + json.expires_in * 1000);
    await this.users.saveOutlookTokens(userId, {
      accessToken:  json.access_token,
      refreshToken: json.refresh_token,
      expiresAt,
    });
  }

  async getValidAccessToken(userId: string): Promise<string> {
    const stored = await this.users.getOutlookTokens(userId);
    if (!stored?.outlookAccessToken || !stored?.outlookRefreshToken) {
      throw new UnauthorizedException('Outlook not connected');
    }

    const fiveMin  = 5 * 60 * 1000;
    const isExpired = !stored.outlookTokenExpiresAt ||
      stored.outlookTokenExpiresAt.getTime() - Date.now() < fiveMin;

    if (!isExpired) return stored.outlookAccessToken;

    const clientId     = this.config.get<string>('microsoft.clientId')!;
    const clientSecret = this.config.get<string>('microsoft.clientSecret')!;

    const body = new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: stored.outlookRefreshToken,
      grant_type:    'refresh_token',
      scope:         SCOPES.join(' '),
    });

    const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });

    const json = await res.json() as TokenResponse & { error?: string; error_description?: string };

    if (!res.ok || json.error) {
      this.logger.warn(`Failed to refresh Outlook token: ${json.error_description ?? json.error}`);
      throw new UnauthorizedException('Outlook token expired — please reconnect');
    }

    const expiresAt = new Date(Date.now() + json.expires_in * 1000);
    await this.users.saveOutlookTokens(userId, {
      accessToken:  json.access_token,
      refreshToken: json.refresh_token ?? stored.outlookRefreshToken,
      expiresAt,
    });

    return json.access_token;
  }

  async disconnectOutlook(userId: string): Promise<void> {
    await this.users.clearOutlookTokens(userId);
  }
}

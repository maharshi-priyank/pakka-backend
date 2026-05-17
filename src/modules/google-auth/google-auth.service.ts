import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { UsersService } from '../users/users.service';

@Injectable()
export class GoogleAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly users:  UsersService,
  ) {}

  getAuthUrl(userId: string): string {
    const client = this.buildOAuthClient();
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt:      'consent',
      scope:       ['https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/userinfo.email'],
      state:       userId,
    });
  }

  async handleCallback(code: string, userId: string): Promise<void> {
    const client = this.buildOAuthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new UnauthorizedException('Google did not return required tokens');
    }
    await this.users.saveGoogleTokens(userId, {
      accessToken:  tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt:    new Date(tokens.expiry_date ?? Date.now() + 3600 * 1000),
    });
  }

  async getAuthorizedClient(userId: string) {
    const stored = await this.users.getGoogleTokens(userId);
    if (!stored?.googleAccessToken || !stored?.googleRefreshToken) {
      throw new UnauthorizedException('Google Calendar not connected');
    }

    const client = this.buildOAuthClient();
    client.setCredentials({
      access_token:  stored.googleAccessToken,
      refresh_token: stored.googleRefreshToken,
      expiry_date:   stored.googleTokenExpiresAt?.getTime(),
    });

    // Auto-refresh if expired
    if (stored.googleTokenExpiresAt && stored.googleTokenExpiresAt < new Date()) {
      const { credentials } = await client.refreshAccessToken();
      await this.users.saveGoogleTokens(userId, {
        accessToken:  credentials.access_token!,
        refreshToken: credentials.refresh_token ?? stored.googleRefreshToken,
        expiresAt:    new Date(credentials.expiry_date ?? Date.now() + 3600 * 1000),
      });
      client.setCredentials(credentials);
    }

    return client;
  }

  async disconnectCalendar(userId: string): Promise<void> {
    const stored = await this.users.getGoogleTokens(userId);
    if (stored?.googleAccessToken) {
      try {
        const client = this.buildOAuthClient();
        client.setCredentials({ access_token: stored.googleAccessToken });
        await client.revokeCredentials();
      } catch {
        // Revocation is best-effort — clear tokens regardless
      }
    }
    await this.users.clearGoogleTokens(userId);
  }

  private buildOAuthClient() {
    return new google.auth.OAuth2(
      this.config.get<string>('google.clientId'),
      this.config.get<string>('google.clientSecret'),
      this.config.get<string>('google.redirectUri'),
    );
  }
}

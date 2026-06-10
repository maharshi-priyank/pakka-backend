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

  private static readonly CALENDAR_SCOPES = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.email',
  ];

  private static readonly DOCS_SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/documents.readonly',
  ];

  private static readonly SHEETS_SCOPES = [
    'https://www.googleapis.com/auth/spreadsheets',
  ];

  getAuthUrl(userId: string): string {
    const client = this.buildOAuthClient();
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt:      'consent',
      scope:       GoogleAuthService.CALENDAR_SCOPES,
      state:       userId,
    });
  }

  getDocsAuthUrl(userId: string): string {
    const client = this.buildOAuthClient();
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt:      'consent',
      scope:       GoogleAuthService.DOCS_SCOPES,
      state:       `docs:${userId}`,
    });
  }

  getSheetsAuthUrl(userId: string): string {
    const client = this.buildOAuthClient();
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt:      'consent',
      scope:       GoogleAuthService.SHEETS_SCOPES,
      state:       `sheets:${userId}`,
    });
  }

  async handleCallback(code: string, rawState: string): Promise<{ type: 'calendar' | 'docs' | 'sheets' }> {
    const isDocsFlow   = rawState.startsWith('docs:');
    const isSheetsFlow = rawState.startsWith('sheets:');
    const userId = isDocsFlow   ? rawState.slice(5)
                 : isSheetsFlow ? rawState.slice(7)
                 : rawState;

    const client = this.buildOAuthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new UnauthorizedException('Google did not return required tokens');
    }

    const tokenPayload = {
      accessToken:  tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt:    new Date(tokens.expiry_date ?? Date.now() + 3600 * 1000),
    };

    if (isDocsFlow) {
      await this.users.saveGoogleDocsConnected(userId, true);
      await this.users.saveGoogleTokens(userId, tokenPayload);
      return { type: 'docs' };
    }

    if (isSheetsFlow) {
      // Sheets service will set googleSheetsConnected + googleSheetsId after creating the spreadsheet
      await this.users.saveGoogleTokens(userId, tokenPayload);
      return { type: 'sheets' };
    }

    await this.users.saveGoogleTokens(userId, tokenPayload);
    return { type: 'calendar' };
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

  async disconnectDocs(userId: string): Promise<void> {
    await this.users.saveGoogleDocsConnected(userId, false);
  }

  async disconnectSheets(userId: string): Promise<void> {
    await this.users.saveGoogleSheetsConnected(userId, false, null);
  }

  private buildOAuthClient() {
    return new google.auth.OAuth2(
      this.config.get<string>('google.clientId'),
      this.config.get<string>('google.clientSecret'),
      this.config.get<string>('google.redirectUri'),
    );
  }
}

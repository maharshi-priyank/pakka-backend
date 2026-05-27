import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConfidentialClientApplication, type AuthorizationCodeRequest, type RefreshTokenRequest } from '@azure/msal-node';
import { UsersService } from '../users/users.service.js';

const SCOPES = [
  'openid',
  'email',
  'offline_access',
  'Calendars.ReadWrite',
];

@Injectable()
export class MicrosoftAuthService {
  private readonly logger = new Logger(MicrosoftAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly users:  UsersService,
  ) {}

  getAuthUrl(userId: string): string {
    const msalClient  = this.buildMsalClient();
    const redirectUri = this.config.get<string>('microsoft.redirectUri')!;

    // Build the authorization URL manually — MSAL's getAuthCodeUrl is async
    // and we return a sync response from the controller. We use the standard
    // OAuth2 authorize endpoint directly.
    const tenantId    = this.config.get<string>('microsoft.tenantId') ?? 'common';
    const clientId    = this.config.get<string>('microsoft.clientId')!;
    const params      = new URLSearchParams({
      client_id:     clientId,
      response_type: 'code',
      redirect_uri:  redirectUri,
      scope:         SCOPES.join(' '),
      response_mode: 'query',
      state:         userId,
    });
    void msalClient; // keep import used
    return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async handleCallback(code: string, userId: string): Promise<void> {
    const msalClient  = this.buildMsalClient();
    const redirectUri = this.config.get<string>('microsoft.redirectUri')!;

    const request: AuthorizationCodeRequest = {
      code,
      scopes:      SCOPES,
      redirectUri,
    };

    const response = await msalClient.acquireTokenByCode(request);
    if (!response?.accessToken) {
      throw new UnauthorizedException('Microsoft did not return an access token');
    }

    // MSAL returns refresh token only when offline_access scope is in the token cache
    // We extract it from the cache entry
    const cache         = msalClient.getTokenCache().serialize();
    const cacheObj      = JSON.parse(cache) as Record<string, Record<string, { secret: string; target: string }>>;
    const refreshTokens = cacheObj['RefreshToken'] ?? {};
    const rtEntry       = Object.values(refreshTokens).find(e =>
      e.target?.includes('offline_access'),
    );
    const refreshToken  = rtEntry?.secret;

    if (!refreshToken) {
      throw new UnauthorizedException('Microsoft did not return a refresh token — ensure offline_access scope is consented');
    }

    const expiresAt = response.expiresOn ?? new Date(Date.now() + 3600 * 1000);
    await this.users.saveOutlookTokens(userId, {
      accessToken:  response.accessToken,
      refreshToken,
      expiresAt,
    });
  }

  async getValidAccessToken(userId: string): Promise<string> {
    const stored = await this.users.getOutlookTokens(userId);
    if (!stored?.outlookAccessToken || !stored?.outlookRefreshToken) {
      throw new UnauthorizedException('Outlook not connected');
    }

    // Refresh if within 5 minutes of expiry
    const fiveMin = 5 * 60 * 1000;
    const isExpired = !stored.outlookTokenExpiresAt ||
      stored.outlookTokenExpiresAt.getTime() - Date.now() < fiveMin;

    if (!isExpired) return stored.outlookAccessToken;

    const msalClient = this.buildMsalClient();
    const request: RefreshTokenRequest = {
      refreshToken: stored.outlookRefreshToken,
      scopes:       SCOPES,
    };

    try {
      const response = await msalClient.acquireTokenByRefreshToken(request);
      if (!response?.accessToken) throw new Error('Empty token response');

      const expiresAt = response.expiresOn ?? new Date(Date.now() + 3600 * 1000);
      await this.users.saveOutlookTokens(userId, {
        accessToken:  response.accessToken,
        refreshToken: stored.outlookRefreshToken,
        expiresAt,
      });
      return response.accessToken;
    } catch (err) {
      this.logger.warn(`Failed to refresh Outlook token: ${(err as Error).message}`);
      throw new UnauthorizedException('Outlook token expired — please reconnect');
    }
  }

  async disconnectOutlook(userId: string): Promise<void> {
    await this.users.clearOutlookTokens(userId);
  }

  private buildMsalClient(): ConfidentialClientApplication {
    const clientId     = this.config.get<string>('microsoft.clientId') ?? '';
    const clientSecret = this.config.get<string>('microsoft.clientSecret') ?? '';
    const tenantId     = this.config.get<string>('microsoft.tenantId') ?? 'common';

    return new ConfidentialClientApplication({
      auth: {
        clientId,
        clientSecret,
        authority: `https://login.microsoftonline.com/${tenantId}`,
      },
    });
  }
}

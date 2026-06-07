import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { UsersService } from '../users/users.service.js';

interface CanvaTokenResponse {
  access_token:  string;
  refresh_token: string;
  expires_in:    number;
  token_type:    string;
}

@Injectable()
export class CanvaAuthService {
  private readonly logger = new Logger(CanvaAuthService.name);
  // state → { codeVerifier, userId }
  private readonly pkceStore = new Map<string, { codeVerifier: string; userId: string }>();

  constructor(
    private readonly config: ConfigService,
    private readonly users:  UsersService,
  ) {}

  getAuthUrl(userId: string): string {
    const clientId   = this.config.get<string>('canva.clientId')!;
    const redirectUri = this.config.get<string>('canva.redirectUri')!;

    const codeVerifier  = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const state         = randomBytes(16).toString('hex');

    this.pkceStore.set(state, { codeVerifier, userId });

    // Clean up stale entries after 10 minutes
    setTimeout(() => this.pkceStore.delete(state), 10 * 60 * 1000);

    const params = new URLSearchParams({
      response_type:         'code',
      client_id:             clientId,
      redirect_uri:          redirectUri,
      scope:                 'design:content:read asset:read',
      state,
      code_challenge:        codeChallenge,
      code_challenge_method: 'S256',
    });

    return `https://www.canva.com/api/oauth/authorize?${params.toString()}`;
  }

  async handleCallback(code: string, state: string): Promise<void> {
    const entry = this.pkceStore.get(state);
    if (!entry) throw new UnauthorizedException('Invalid or expired OAuth state');

    this.pkceStore.delete(state);

    const { codeVerifier, userId } = entry;
    const clientId     = this.config.get<string>('canva.clientId')!;
    const clientSecret = this.config.get<string>('canva.clientSecret')!;
    const redirectUri  = this.config.get<string>('canva.redirectUri')!;

    const body = new URLSearchParams({
      grant_type:    'authorization_code',
      client_id:     clientId,
      client_secret: clientSecret,
      redirect_uri:  redirectUri,
      code,
      code_verifier: codeVerifier,
    });

    const tokenRes = await fetch('https://api.canva.com/rest/v1/oauth/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });

    const tokenJson = await tokenRes.json() as CanvaTokenResponse & { error?: string };

    if (!tokenRes.ok || tokenJson.error) {
      this.logger.error(`Canva token exchange failed: ${tokenJson.error}`);
      throw new UnauthorizedException(`Canva auth failed: ${tokenJson.error}`);
    }

    const expiresAt = new Date(Date.now() + tokenJson.expires_in * 1000);

    await this.users.saveCanvaTokens(userId, {
      accessToken:  tokenJson.access_token,
      refreshToken: tokenJson.refresh_token,
      expiresAt,
    });
  }

  async refreshAccessToken(userId: string): Promise<string> {
    const tokens = await this.users.getCanvaTokens(userId);
    if (!tokens?.canvaRefreshToken) throw new UnauthorizedException('Canva not connected');

    const clientId     = this.config.get<string>('canva.clientId')!;
    const clientSecret = this.config.get<string>('canva.clientSecret')!;

    const body = new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: tokens.canvaRefreshToken,
    });

    const res  = await fetch('https://api.canva.com/rest/v1/oauth/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });

    const json = await res.json() as CanvaTokenResponse & { error?: string };

    if (!res.ok || json.error) {
      this.logger.error(`Canva token refresh failed: ${json.error}`);
      throw new UnauthorizedException('Canva token refresh failed');
    }

    const expiresAt = new Date(Date.now() + json.expires_in * 1000);
    await this.users.saveCanvaTokens(userId, {
      accessToken:  json.access_token,
      refreshToken: json.refresh_token,
      expiresAt,
    });

    return json.access_token;
  }

  async disconnect(userId: string): Promise<void> {
    await this.users.clearCanvaTokens(userId);
  }
}

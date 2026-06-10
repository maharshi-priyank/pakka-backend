import { Injectable, UnauthorizedException, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { UsersService } from '../users/users.service.js';

interface CanvaTokenResponse {
  access_token:  string;
  refresh_token: string;
  expires_in:    number;
  token_type:    string;
}

const CANVA_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';

// Canva requires scopes as space-separated string
// These must match exactly what is enabled in the Developer Portal
const SCOPES = 'design:content:read design:meta:read asset:read profile:read';

@Injectable()
export class CanvaAuthService {
  private readonly logger = new Logger(CanvaAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly users:  UsersService,
  ) {}

  // ─── Step 1: Build authorization URL ────────────────────────────────────────
  // Per docs: code_verifier must be 96 random bytes (base64url), state must be 96 random bytes
  // code_challenge = SHA-256(code_verifier) → base64url

  async getAuthUrl(userId: string): Promise<string> {
    const clientId    = this.config.get<string>('canva.clientId')!;
    const redirectUri = this.config.get<string>('canva.redirectUri')!;

    // Generate high-entropy values per Canva spec
    const codeVerifier  = randomBytes(96).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const state         = randomBytes(96).toString('base64url');

    // Await the DB write — do NOT fire-and-forget; if this fails the callback will always fail
    try {
      await this.users.saveCanvaPkce(userId, state, codeVerifier);
    } catch (err) {
      this.logger.error(`Failed to persist Canva PKCE state for user ${userId}`, err);
      throw new InternalServerErrorException('Could not initiate Canva OAuth. Please try again.');
    }

    const params = new URLSearchParams({
      response_type:         'code',
      client_id:             clientId,
      redirect_uri:          redirectUri,
      scope:                 SCOPES,
      state,
      code_challenge:        codeChallenge,
      code_challenge_method: 'S256',
    });

    return `https://www.canva.com/api/oauth/authorize?${params.toString()}`;
  }

  // ─── Step 2: Exchange authorization code for tokens ─────────────────────────
  // Per docs: use Basic Auth header (base64(clientId:clientSecret)), NOT body params

  async handleCallback(code: string, state: string): Promise<void> {
    const pkce = await this.users.consumeCanvaPkce(state);
    if (!pkce) throw new UnauthorizedException('Invalid or expired OAuth state. Please try connecting again.');

    const { userId, codeVerifier } = pkce;
    const clientId     = this.config.get<string>('canva.clientId')!;
    const clientSecret = this.config.get<string>('canva.clientSecret')!;
    const redirectUri  = this.config.get<string>('canva.redirectUri')!;

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const body = new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri:  redirectUri,
    });

    const tokenRes = await fetch(CANVA_TOKEN_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: body.toString(),
    });

    const tokenJson = await tokenRes.json() as CanvaTokenResponse & { error?: string; error_description?: string };

    if (!tokenRes.ok || tokenJson.error) {
      this.logger.error(
        `Canva token exchange failed [${tokenRes.status}]: ${JSON.stringify(tokenJson)}`,
      );
      throw new UnauthorizedException(
        `Canva auth failed: ${tokenJson.error_description ?? tokenJson.error ?? 'unknown error'}`,
      );
    }

    await this.users.saveCanvaTokens(userId, {
      accessToken:  tokenJson.access_token,
      refreshToken: tokenJson.refresh_token,
      expiresAt:    new Date(Date.now() + tokenJson.expires_in * 1000),
    });
  }

  // ─── Step 3: Refresh access token ───────────────────────────────────────────
  // Per docs: use Basic Auth header; each refresh token is single-use — save the new one

  async refreshAccessToken(userId: string): Promise<string> {
    const tokens = await this.users.getCanvaTokens(userId);
    if (!tokens?.canvaRefreshToken) throw new UnauthorizedException('Canva not connected');

    const clientId     = this.config.get<string>('canva.clientId')!;
    const clientSecret = this.config.get<string>('canva.clientSecret')!;
    const basicAuth    = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const body = new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: tokens.canvaRefreshToken,
    });

    const res = await fetch(CANVA_TOKEN_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: body.toString(),
    });

    const json = await res.json() as CanvaTokenResponse & { error?: string; error_description?: string };

    if (!res.ok || json.error) {
      this.logger.error(`Canva token refresh failed [${res.status}]: ${JSON.stringify(json)}`);
      throw new UnauthorizedException(
        `Canva token refresh failed: ${json.error_description ?? json.error ?? 'unknown error'}`,
      );
    }

    await this.users.saveCanvaTokens(userId, {
      accessToken:  json.access_token,
      refreshToken: json.refresh_token, // each refresh_token is single-use — always save the new one
      expiresAt:    new Date(Date.now() + json.expires_in * 1000),
    });

    return json.access_token;
  }

  // ─── Disconnect ──────────────────────────────────────────────────────────────

  async disconnect(userId: string): Promise<void> {
    await this.users.clearCanvaTokens(userId);
  }
}

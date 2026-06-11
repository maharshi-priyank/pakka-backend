import { Injectable, UnauthorizedException, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes } from 'crypto';
import { UsersService } from '../users/users.service.js';

interface CanvaTokenResponse {
  access_token:  string;
  refresh_token: string;
  expires_in:    number;
  token_type:    string;
}

const CANVA_TOKEN_URL = 'https://api.canva.com/rest/v1/oauth/token';
const SCOPES          = 'design:content:read design:meta:read asset:read profile:read';
const STATE_TTL_MS    = 10 * 60 * 1000; // 10 minutes

// ─── Signed state ─────────────────────────────────────────────────────────────
// Encodes userId + codeVerifier + expiry into the OAuth `state` param.
// Signed with SUPABASE_JWT_SECRET so it can't be forged and survives across
// fly.io instances with no DB writes needed.
//
// Format (base64url): base64url(JSON payload) + '.' + HMAC-SHA256 signature

interface StatePayload {
  userId:       string;
  codeVerifier: string;
  exp:          number;
}

function signState(payload: StatePayload, secret: string): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig  = createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyState(state: string, secret: string): StatePayload {
  const dot  = state.lastIndexOf('.');
  if (dot === -1) throw new Error('malformed state');

  const data = state.slice(0, dot);
  const sig  = state.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(data).digest('base64url');

  // Constant-time comparison to prevent timing attacks
  if (sig.length !== expected.length) throw new Error('invalid state signature');
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) throw new Error('invalid state signature');

  const payload: StatePayload = JSON.parse(Buffer.from(data, 'base64url').toString());
  if (Date.now() > payload.exp) throw new Error('state expired');
  return payload;
}

@Injectable()
export class CanvaAuthService {
  private readonly logger = new Logger(CanvaAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly users:  UsersService,
  ) {}

  // ─── Step 1: Build authorization URL ─────────────────────────────────────────

  async getAuthUrl(userId: string): Promise<string> {
    const clientId    = this.config.get<string>('canva.clientId');
    const redirectUri = this.config.get<string>('canva.redirectUri');
    const secret      = this.config.get<string>('supabase.jwtSecret');

    if (!clientId || !redirectUri) {
      this.logger.error('CANVA_CLIENT_ID or CANVA_REDIRECT_URI not set');
      throw new InternalServerErrorException('Canva integration is not configured.');
    }
    if (!secret) {
      this.logger.error('SUPABASE_JWT_SECRET not set — cannot sign Canva state');
      throw new InternalServerErrorException('Server configuration error.');
    }

    // Per Canva docs: code_verifier = 96 random bytes base64url
    const codeVerifier  = randomBytes(96).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');

    // Encode everything into the state — no DB write needed
    const state = signState(
      { userId, codeVerifier, exp: Date.now() + STATE_TTL_MS },
      secret,
    );

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

  // ─── Step 2: Exchange authorization code for tokens ──────────────────────────
  // Per docs: use Basic Auth header (base64(clientId:clientSecret)), NOT body

  async handleCallback(code: string, state: string): Promise<void> {
    const secret = this.config.get<string>('supabase.jwtSecret');
    if (!secret) throw new InternalServerErrorException('Server configuration error.');

    let payload: StatePayload;
    try {
      payload = verifyState(state, secret);
    } catch (err: any) {
      this.logger.warn(`Canva state verification failed: ${err.message}`);
      throw new UnauthorizedException('Invalid or expired OAuth state. Please try connecting again.');
    }

    const { userId, codeVerifier } = payload;
    const clientId     = this.config.get<string>('canva.clientId')!;
    const clientSecret = this.config.get<string>('canva.clientSecret')!;
    const redirectUri  = this.config.get<string>('canva.redirectUri')!;
    const basicAuth    = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

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
        `Canva auth failed: ${tokenJson.error_description ?? tokenJson.error ?? 'unknown'}`,
      );
    }

    await this.users.saveCanvaTokens(userId, {
      accessToken:  tokenJson.access_token,
      refreshToken: tokenJson.refresh_token,
      expiresAt:    new Date(Date.now() + tokenJson.expires_in * 1000),
    });
  }

  // ─── Step 3: Refresh access token ────────────────────────────────────────────
  // Per docs: Basic Auth; each refresh token is single-use

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

    const res  = await fetch(CANVA_TOKEN_URL, {
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
        `Canva token refresh failed: ${json.error_description ?? json.error ?? 'unknown'}`,
      );
    }

    await this.users.saveCanvaTokens(userId, {
      accessToken:  json.access_token,
      refreshToken: json.refresh_token,
      expiresAt:    new Date(Date.now() + json.expires_in * 1000),
    });

    return json.access_token;
  }

  // ─── Disconnect ───────────────────────────────────────────────────────────────

  async disconnect(userId: string): Promise<void> {
    await this.users.clearCanvaTokens(userId);
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { UsersService } from '../users/users.service';

const CALENDLY_AUTH_URL  = 'https://auth.calendly.com/oauth/authorize';
const CALENDLY_TOKEN_URL = 'https://auth.calendly.com/oauth/token';
const CALENDLY_API_URL   = 'https://api.calendly.com';

@Injectable()
export class CalendlyAuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly users:  UsersService,
  ) {}

  getAuthUrl(userId: string): string {
    const params = new URLSearchParams({
      client_id:     this.config.get<string>('calendly.clientId') ?? '',
      response_type: 'code',
      redirect_uri:  this.redirectUri,
      state:         userId,
    });
    return `${CALENDLY_AUTH_URL}?${params.toString()}`;
  }

  async handleCallback(code: string, userId: string): Promise<void> {
    const { data: tokenData } = await axios.post(
      CALENDLY_TOKEN_URL,
      new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        redirect_uri:  this.redirectUri,
        client_id:     this.config.get<string>('calendly.clientId') ?? '',
        client_secret: this.config.get<string>('calendly.clientSecret') ?? '',
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const { schedulingUrl, userUri } = await this.fetchUserInfo(tokenData.access_token);

    await this.users.saveCalendlyTokens(userId, {
      accessToken:  tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt:    new Date(Date.now() + (tokenData.expires_in ?? 7200) * 1000),
      schedulingUrl,
      userUri,
    });
  }

  async disconnectCalendly(userId: string): Promise<void> {
    const stored = await this.users.getCalendlyTokens(userId);
    if (stored?.calendlyAccessToken) {
      try {
        await axios.post(
          `${CALENDLY_TOKEN_URL}/revoke`,
          new URLSearchParams({ token: stored.calendlyAccessToken }).toString(),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            auth: {
              username: this.config.get<string>('calendly.clientId') ?? '',
              password: this.config.get<string>('calendly.clientSecret') ?? '',
            },
          },
        );
      } catch {
        // Revocation is best-effort — clear tokens regardless
      }
    }
    await this.users.clearCalendlyTokens(userId);
  }

  async getAccessToken(userId: string): Promise<string> {
    const stored = await this.users.getCalendlyTokens(userId);
    if (!stored?.calendlyAccessToken || !stored?.calendlyRefreshToken) {
      throw new UnauthorizedException('Calendly not connected');
    }

    if (stored.calendlyTokenExpiresAt && stored.calendlyTokenExpiresAt < new Date()) {
      const { data } = await axios.post(
        CALENDLY_TOKEN_URL,
        new URLSearchParams({
          grant_type:    'refresh_token',
          refresh_token: stored.calendlyRefreshToken,
          client_id:     this.config.get<string>('calendly.clientId') ?? '',
          client_secret: this.config.get<string>('calendly.clientSecret') ?? '',
        }).toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );

      await this.users.saveCalendlyTokens(userId, {
        accessToken:   data.access_token,
        refreshToken:  data.refresh_token ?? stored.calendlyRefreshToken,
        expiresAt:     new Date(Date.now() + (data.expires_in ?? 7200) * 1000),
        schedulingUrl: stored.calendlySchedulingUrl ?? '',
        userUri:       '',
      });

      return data.access_token as string;
    }

    return stored.calendlyAccessToken;
  }

  verifyWebhookSignature(rawBody: Buffer, signatureHeader: string): boolean {
    const secret = this.config.get<string>('calendly.webhookSecret');
    if (!secret) return true; // skip verification if secret not set

    const parts = Object.fromEntries(
      signatureHeader.split(',').map(p => p.split('=')),
    ) as { t: string; v1: string };

    if (!parts.t || !parts.v1) return false;

    const crypto = require('crypto') as typeof import('crypto');
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${parts.t}.${rawBody.toString('utf8')}`)
      .digest('base64');

    return expected === parts.v1;
  }

  findUserByCalendlyUri(uri: string) {
    return this.users.findByCalendlyUri(uri);
  }

  private async fetchUserInfo(accessToken: string): Promise<{ schedulingUrl: string; userUri: string }> {
    const { data } = await axios.get(`${CALENDLY_API_URL}/users/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return {
      schedulingUrl: (data.resource?.scheduling_url as string) ?? '',
      userUri:       (data.resource?.uri as string) ?? '',
    };
  }

  private get redirectUri(): string {
    return this.config.get<string>('calendly.redirectUri') ?? 'http://localhost:3000/api/v1/auth/calendly/callback';
  }
}

import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service.js';

interface ClickUpTokenResponse {
  access_token: string;
  token_type:   string;
}

interface ClickUpTeam {
  id:   string;
  name: string;
}

@Injectable()
export class ClickUpAuthService {
  private readonly logger = new Logger(ClickUpAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly users:  UsersService,
  ) {}

  getAuthUrl(userId: string): string {
    const clientId   = this.config.get<string>('clickup.clientId')!;
    const redirectUri = this.config.get<string>('clickup.redirectUri')!;

    const params = new URLSearchParams({
      client_id:    clientId,
      redirect_uri: redirectUri,
      state:        userId,
    });

    return `https://app.clickup.com/api?${params.toString()}`;
  }

  async handleCallback(code: string, userId: string): Promise<void> {
    const clientId     = this.config.get<string>('clickup.clientId')!;
    const clientSecret = this.config.get<string>('clickup.clientSecret')!;

    const body = new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      code,
    });

    const tokenRes = await fetch('https://api.clickup.com/api/v2/oauth/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });

    const tokenJson = await tokenRes.json() as ClickUpTokenResponse & { err?: string };

    if (!tokenRes.ok || tokenJson.err) {
      this.logger.error(`ClickUp token exchange failed: ${tokenJson.err}`);
      throw new UnauthorizedException(`ClickUp auth failed: ${tokenJson.err}`);
    }

    if (!tokenJson.access_token) {
      throw new UnauthorizedException('ClickUp did not return an access token');
    }

    // Fetch the user's default workspace (first team)
    const teamsRes = await fetch('https://api.clickup.com/api/v2/team', {
      headers: { Authorization: tokenJson.access_token },
    });

    const teamsJson = await teamsRes.json() as { teams: ClickUpTeam[]; err?: string };

    if (!teamsRes.ok || !teamsJson.teams?.length) {
      this.logger.error(`ClickUp teams fetch failed: ${teamsJson.err}`);
      throw new UnauthorizedException('Failed to fetch ClickUp workspace');
    }

    const workspaceId = teamsJson.teams[0].id;

    await this.users.saveClickUpTokens(userId, {
      accessToken: tokenJson.access_token,
      workspaceId,
    });
  }

  async disconnect(userId: string): Promise<void> {
    await this.users.clearClickUpTokens(userId);
  }
}

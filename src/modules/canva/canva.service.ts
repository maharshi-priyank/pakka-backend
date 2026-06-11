import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { CanvaAuthService } from '../canva-auth/canva-auth.service.js';

export interface CanvaDesign {
  id:           string;
  title:        string;
  thumbnailUrl: string | null;
  editUrl:      string;
  viewUrl:      string;
  createdAt:    string;
  updatedAt:    string;
}

interface CanvaApiDesign {
  id:         string;
  title:      string;
  thumbnail?: { url: string };
  urls:       { edit_url: string; view_url: string };
  created_at: string;
  updated_at: string;
}

@Injectable()
export class CanvaService {
  private readonly logger = new Logger(CanvaService.name);

  constructor(
    private readonly users:     UsersService,
    private readonly canvaAuth: CanvaAuthService,
  ) {}

  // ─── Token helpers ────────────────────────────────────────────────────────

  private async getValidToken(userId: string): Promise<string> {
    const tokens = await this.users.getCanvaTokens(userId);
    if (!tokens?.canvaAccessToken) throw new UnauthorizedException('Canva not connected');

    // Refresh if: no expiry recorded, already expired, or expiring within 5 minutes
    const expiresAt = tokens.canvaTokenExpiresAt;
    const needsRefresh = !expiresAt || expiresAt.getTime() < Date.now() + 5 * 60 * 1000;

    if (needsRefresh) {
      try {
        return await this.canvaAuth.refreshAccessToken(userId);
      } catch (err) {
        this.logger.warn(`Canva proactive refresh failed for user ${userId}, trying stored token`);
        // Fall through and try with the current token — maybe the expiry is wrong
      }
    }

    return tokens.canvaAccessToken;
  }

  // Force refresh and retry on 401 from Canva API
  private async fetchWithRetry(
    userId: string,
    url: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const token = await this.getValidToken(userId);
    const headers = { ...options.headers as Record<string, string>, Authorization: `Bearer ${token}` };

    let res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      this.logger.warn(`Canva 401 on first attempt for user ${userId}, force-refreshing token`);
      try {
        const freshToken = await this.canvaAuth.refreshAccessToken(userId);
        res = await fetch(url, {
          ...options,
          headers: { ...options.headers as Record<string, string>, Authorization: `Bearer ${freshToken}` },
        });
      } catch (refreshErr) {
        this.logger.error(`Canva token refresh failed for user ${userId}`, refreshErr);
        // Clear bad tokens so the UI shows "reconnect" instead of looping on 401
        await this.users.clearCanvaTokens(userId).catch(() => {});
        throw new UnauthorizedException('Canva session expired — please reconnect Canva in Settings');
      }
    }

    return res;
  }

  // ─── API methods ──────────────────────────────────────────────────────────

  async getDesigns(userId: string, query?: string): Promise<{ designs: CanvaDesign[]; continuation?: string }> {
    const params = new URLSearchParams({ limit: '20' });
    if (query) params.set('query', query);

    const res = await this.fetchWithRetry(
      userId,
      `https://api.canva.com/rest/v1/designs?${params.toString()}`,
      { headers: { 'Content-Type': 'application/json' } },
    );

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Canva designs fetch failed [${res.status}]: ${err}`);
      if (res.status === 403) throw new UnauthorizedException('Canva scope insufficient — enable design:meta:read in your Canva developer portal, then reconnect');
      throw new UnauthorizedException(`Canva API error ${res.status}: ${err}`);
    }

    const json = await res.json() as { items: CanvaApiDesign[]; continuation?: string };

    const designs: CanvaDesign[] = (json.items ?? []).map((d) => ({
      id:           d.id,
      title:        d.title || 'Untitled',
      thumbnailUrl: d.thumbnail?.url ?? null,
      editUrl:      d.urls.edit_url,
      viewUrl:      d.urls.view_url,
      createdAt:    d.created_at,
      updatedAt:    d.updated_at,
    }));

    return { designs, continuation: json.continuation };
  }

  async getDesign(userId: string, designId: string): Promise<CanvaDesign> {
    const res = await this.fetchWithRetry(
      userId,
      `https://api.canva.com/rest/v1/designs/${designId}`,
    );

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Canva design fetch failed [${res.status}]: ${err}`);
      throw new UnauthorizedException('Failed to fetch Canva design');
    }

    const json = await res.json() as { design: CanvaApiDesign };
    const d = json.design;

    return {
      id:           d.id,
      title:        d.title || 'Untitled',
      thumbnailUrl: d.thumbnail?.url ?? null,
      editUrl:      d.urls.edit_url,
      viewUrl:      d.urls.view_url,
      createdAt:    d.created_at,
      updatedAt:    d.updated_at,
    };
  }
}

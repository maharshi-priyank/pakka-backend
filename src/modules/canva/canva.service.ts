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
    private readonly users:    UsersService,
    private readonly canvaAuth: CanvaAuthService,
  ) {}

  private async getValidToken(userId: string): Promise<string> {
    const tokens = await this.users.getCanvaTokens(userId);
    if (!tokens?.canvaAccessToken) throw new UnauthorizedException('Canva not connected');

    // Refresh if expired or expiring within 2 minutes
    if (tokens.canvaTokenExpiresAt && tokens.canvaTokenExpiresAt.getTime() < Date.now() + 2 * 60 * 1000) {
      return this.canvaAuth.refreshAccessToken(userId);
    }

    return tokens.canvaAccessToken;
  }

  async getDesigns(userId: string, query?: string): Promise<{ designs: CanvaDesign[]; continuation?: string }> {
    const token = await this.getValidToken(userId);

    const params = new URLSearchParams({ limit: '20' });
    if (query) params.set('query', query);

    const res = await fetch(`https://api.canva.com/rest/v1/designs?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Canva designs fetch failed: ${err}`);
      throw new UnauthorizedException('Failed to fetch Canva designs');
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
    const token = await this.getValidToken(userId);

    const res = await fetch(`https://api.canva.com/rest/v1/designs/${designId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.text();
      this.logger.error(`Canva design fetch failed: ${err}`);
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

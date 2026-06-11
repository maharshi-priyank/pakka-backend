import { Injectable, UnauthorizedException, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
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
    private readonly config:    ConfigService,
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

  // ─── Export design as PDF → upload to Supabase → return public URL ──────────
  // Requires design:content:read scope on the Canva integration.
  // Returns a permanent Supabase public URL that any client can access.

  async exportDesignAsPdf(userId: string, designId: string, designTitle: string): Promise<string> {
    // Step 1: kick off export job
    const startRes = await this.fetchWithRetry(userId, 'https://api.canva.com/rest/v1/exports', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        design_id: designId,
        format:    { type: 'pdf', export_quality: 'regular' },
      }),
    });

    if (!startRes.ok) {
      const err = await startRes.text();
      this.logger.error(`Canva export start failed [${startRes.status}]: ${err}`);
      throw new InternalServerErrorException(`Canva export failed: ${err}`);
    }

    const startJson = await startRes.json() as { job: { id: string; status: string } };
    const jobId = startJson.job.id;

    // Step 2: poll until success (max 30 attempts × 2 s = 60 s)
    let downloadUrl: string | undefined;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 2000));

      const pollRes = await this.fetchWithRetry(userId, `https://api.canva.com/rest/v1/exports/${jobId}`);
      if (!pollRes.ok) continue;

      const pollJson = await pollRes.json() as { job: { status: string; urls?: string[]; error?: { code: string } } };
      const job = pollJson.job;

      if (job.status === 'success' && job.urls?.length) {
        downloadUrl = job.urls[0];
        break;
      }
      if (job.status === 'failed') {
        throw new InternalServerErrorException(`Canva export job failed: ${job.error?.code ?? 'unknown'}`);
      }
      // status === 'in_progress' → keep polling
    }

    if (!downloadUrl) throw new InternalServerErrorException('Canva export timed out');

    // Step 3: download PDF bytes
    const pdfRes = await fetch(downloadUrl);
    if (!pdfRes.ok) throw new InternalServerErrorException('Failed to download exported PDF from Canva');
    const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

    // Step 4: upload to Supabase Storage
    const supabaseUrl    = this.config.getOrThrow<string>('supabase.url');
    const serviceRoleKey = this.config.getOrThrow<string>('supabase.serviceRoleKey');
    const storage = createClient(supabaseUrl, serviceRoleKey).storage;

    const safeName  = (designTitle || 'design').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
    const rand      = Math.random().toString(36).slice(2, 10);
    const storagePath = `attachments/canva/${rand}-${safeName}.pdf`;

    const { error: uploadError } = await storage
      .from('deliverables')
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: false });

    if (uploadError) {
      this.logger.error(`Supabase upload failed: ${uploadError.message}`);
      throw new InternalServerErrorException('Failed to save exported PDF');
    }

    const { data: urlData } = storage.from('deliverables').getPublicUrl(storagePath);
    return urlData.publicUrl;
  }
}

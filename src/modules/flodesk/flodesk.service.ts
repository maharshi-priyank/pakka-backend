import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';

const FLODESK_BASE = 'https://api.flodesk.com/v1';

interface FlodeskSubscriber {
  email:      string;
  first_name?: string;
  last_name?:  string;
}

interface FlodeskSegment {
  id:   string;
  name: string;
}

@Injectable()
export class FlodeskService {
  private readonly logger = new Logger(FlodeskService.name);
  // In-memory cache: userId → { segmentName → segmentId }
  private readonly segmentCache = new Map<string, Map<string, string>>();

  constructor(private readonly users: UsersService) {}

  private authHeader(apiKey: string): string {
    return `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
  }

  private async request<T>(apiKey: string, method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${FLODESK_BASE}${path}`, {
      method,
      headers: {
        Authorization:  this.authHeader(apiKey),
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Flodesk API ${res.status}: ${text}`);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  private async getApiKey(userId: string): Promise<string> {
    const stored = await this.users.getFlodeskApiKey(userId);
    if (!stored?.flodeskApiKey) throw new UnauthorizedException('Flodesk not connected');
    return stored.flodeskApiKey;
  }

  async validateAndSave(userId: string, apiKey: string): Promise<void> {
    // Validate by fetching segments — throws if key is invalid
    const res = await fetch(`${FLODESK_BASE}/segments`, {
      headers: { Authorization: this.authHeader(apiKey) },
    });
    if (!res.ok) throw new BadRequestException('Invalid Flodesk API key');
    await this.users.saveFlodeskApiKey(userId, apiKey);
  }

  async disconnect(userId: string): Promise<void> {
    this.segmentCache.delete(userId);
    await this.users.clearFlodeskApiKey(userId);
  }

  private async ensureSegment(apiKey: string, userId: string, name: string): Promise<string> {
    // Check cache first
    if (!this.segmentCache.has(userId)) this.segmentCache.set(userId, new Map());
    const userCache = this.segmentCache.get(userId)!;
    if (userCache.has(name)) return userCache.get(name)!;

    // Fetch all segments
    const data = await this.request<{ data: FlodeskSegment[] }>(apiKey, 'GET', '/segments');
    for (const seg of data.data) {
      userCache.set(seg.name, seg.id);
    }

    if (userCache.has(name)) return userCache.get(name)!;

    // Create the segment if it doesn't exist
    const created = await this.request<FlodeskSegment>(apiKey, 'POST', '/segments', { name });
    userCache.set(created.name, created.id);
    return created.id;
  }

  private parseName(fullName: string): { first_name: string; last_name?: string } {
    const parts = fullName.trim().split(' ');
    return {
      first_name: parts[0],
      last_name:  parts.length > 1 ? parts.slice(1).join(' ') : undefined,
    };
  }

  private async upsertAndTag(apiKey: string, userId: string, subscriber: FlodeskSubscriber, segmentName: string): Promise<void> {
    if (!subscriber.email) return;

    // Upsert subscriber
    await this.request(apiKey, 'PUT', '/subscribers', subscriber);

    // Add to segment
    const segmentId = await this.ensureSegment(apiKey, userId, segmentName);
    await this.request(apiKey, 'POST', `/subscribers/${encodeURIComponent(subscriber.email)}/segments`, {
      segment_ids: [segmentId],
    });
  }

  async syncClient(userId: string, client: { email?: string | null; name: string }): Promise<void> {
    if (!client.email) return;
    try {
      const apiKey = await this.getApiKey(userId);
      await this.upsertAndTag(apiKey, userId, { email: client.email, ...this.parseName(client.name) }, 'Clients');
    } catch (err) {
      this.logger.warn(`Flodesk syncClient failed for user ${userId}: ${(err as Error).message}`);
    }
  }

  async syncLead(userId: string, lead: { email?: string | null; name: string }): Promise<void> {
    if (!lead.email) return;
    try {
      const apiKey = await this.getApiKey(userId);
      await this.upsertAndTag(apiKey, userId, { email: lead.email, ...this.parseName(lead.name) }, 'Leads');
    } catch (err) {
      this.logger.warn(`Flodesk syncLead failed for user ${userId}: ${(err as Error).message}`);
    }
  }

  async syncWonLead(userId: string, lead: { email?: string | null; name: string }): Promise<void> {
    if (!lead.email) return;
    try {
      const apiKey = await this.getApiKey(userId);
      await this.upsertAndTag(apiKey, userId, { email: lead.email, ...this.parseName(lead.name) }, 'Won Clients');
    } catch (err) {
      this.logger.warn(`Flodesk syncWonLead failed for user ${userId}: ${(err as Error).message}`);
    }
  }

  async syncPaidInvoice(userId: string, clientEmail: string | null | undefined, clientName: string): Promise<void> {
    if (!clientEmail) return;
    try {
      const apiKey = await this.getApiKey(userId);
      await this.upsertAndTag(apiKey, userId, { email: clientEmail, ...this.parseName(clientName) }, 'Paying Clients');
    } catch (err) {
      this.logger.warn(`Flodesk syncPaidInvoice failed for user ${userId}: ${(err as Error).message}`);
    }
  }
}

import { Injectable, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Forwards lead-engine requests to the Go microservice.
 * NestJS validates the JWT and injects X-User-Id — Go trusts that header.
 */
@Injectable()
export class LeadsProxyService {
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = config.get<string>('LEADS_ENGINE_URL') ?? 'http://localhost:8080';
  }

  async proxy(
    method: string,
    path: string,
    userId: string,
    body?: unknown,
    queryString?: string,
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}${queryString ? '?' + queryString : ''}`;

    const init: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': userId,
      },
    };
    if (body !== undefined && method !== 'GET' && method !== 'DELETE') {
      init.body = JSON.stringify(body);
    }

    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err: any) {
      throw new HttpException(`Leads engine unreachable: ${err.message}`, 503);
    }

    const text = await res.text();
    if (!res.ok) {
      let msg = text;
      try { msg = JSON.parse(text)?.error ?? text; } catch {}
      throw new HttpException(msg, res.status);
    }

    try { return JSON.parse(text); } catch { return text; }
  }

  async proxyStream(
    path: string,
    userId: string,
    queryString?: string,
  ): Promise<{ body: NodeJS.ReadableStream; contentType: string; disposition: string }> {
    const url = `${this.baseUrl}${path}${queryString ? '?' + queryString : ''}`;
    const res = await fetch(url, {
      headers: { 'X-User-Id': userId },
    });
    if (!res.ok) {
      throw new HttpException('Export failed', res.status);
    }
    return {
      body: res.body as unknown as NodeJS.ReadableStream,
      contentType: res.headers.get('content-type') ?? 'text/csv',
      disposition: res.headers.get('content-disposition') ?? 'attachment; filename="leads.csv"',
    };
  }
}

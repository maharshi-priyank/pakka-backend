import { Injectable } from '@nestjs/common';
import { ILeadProviderAdapter, NormalizedLead, SearchFilters, TestKeyResult, ProviderCatalogEntry } from '../provider.interface';

@Injectable()
export class GoogleMapsAdapter implements ILeadProviderAdapter {
  readonly provider = 'google_maps';

  catalogEntry(): ProviderCatalogEntry {
    return {
      provider: 'google_maps',
      label: 'Google Maps (SerpAPI)',
      category: 'Local / Directory',
      description: 'Find local businesses — name, phone, website, address',
      costNote: '$50/5k searches — use your SerpAPI key',
      requiresKey: true,
    };
  }

  async testKey(key: string): Promise<TestKeyResult> {
    try {
      const res = await fetch(`https://serpapi.com/account?api_key=${key}`);
      const data = await res.json() as any;
      if (data?.account_email) return { valid: true };
      return { valid: false, error: data?.error ?? 'Invalid key' };
    } catch {
      return { valid: false, error: 'Network error' };
    }
  }

  async search(filters: SearchFilters, apiKey?: string): Promise<NormalizedLead[]> {
    if (!apiKey) return [];

    const q = [filters.niche, filters.keyword].filter(Boolean).join(' ') || 'business';
    const location = filters.location ?? 'India';
    const limit = Math.min(filters.limit ?? 20, 20);

    const url = new URL('https://serpapi.com/search');
    url.searchParams.set('engine', 'google_maps');
    url.searchParams.set('q', q);
    url.searchParams.set('location', location);
    url.searchParams.set('num', String(limit));
    url.searchParams.set('api_key', apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) return [];

    const data = await res.json() as any;
    const results = data.local_results ?? [];

    return results.map((r: any) => ({
      source: 'google_maps',
      businessName: r.title,
      website: r.website,
      phone: r.phone,
      location: r.address,
      intentSignals: ['local_business'],
      intentScore: 10,
    } as NormalizedLead));
  }
}

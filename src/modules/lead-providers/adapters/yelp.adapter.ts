import { Injectable } from '@nestjs/common';
import { ILeadProviderAdapter, NormalizedLead, SearchFilters, TestKeyResult, ProviderCatalogEntry } from '../provider.interface';

@Injectable()
export class YelpAdapter implements ILeadProviderAdapter {
  readonly provider = 'yelp';

  catalogEntry(): ProviderCatalogEntry {
    return {
      provider: 'yelp',
      label: 'Yelp Fusion',
      category: 'Local / Directory',
      description: 'Local businesses with ratings, category, and contact info',
      costNote: 'Free — 500 calls/day',
      requiresKey: true,
    };
  }

  async testKey(key: string): Promise<TestKeyResult> {
    try {
      const res = await fetch('https://api.yelp.com/v3/businesses/search?term=cafe&location=NYC&limit=1', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) return { valid: true };
      return { valid: false, error: `Yelp returned ${res.status}` };
    } catch {
      return { valid: false, error: 'Network error' };
    }
  }

  async search(filters: SearchFilters, apiKey?: string): Promise<NormalizedLead[]> {
    if (!apiKey) return [];

    const term = [filters.niche, filters.keyword].filter(Boolean).join(' ') || 'business';
    const location = filters.location ?? 'New York';
    const limit = Math.min(filters.limit ?? 20, 50);

    const url = new URL('https://api.yelp.com/v3/businesses/search');
    url.searchParams.set('term', term);
    url.searchParams.set('location', location);
    url.searchParams.set('limit', String(limit));

    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${apiKey}` } });
    if (!res.ok) return [];

    const data = await res.json() as any;
    return (data.businesses ?? []).map((b: any) => ({
      source: 'yelp',
      businessName: b.name,
      website: b.url,
      phone: b.phone,
      location: b.location?.display_address?.join(', '),
      intentSignals: ['local_business'],
      intentScore: 8,
    } as NormalizedLead));
  }
}

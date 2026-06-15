import { Injectable } from '@nestjs/common';
import { ILeadProviderAdapter, NormalizedLead, SearchFilters, TestKeyResult, ProviderCatalogEntry } from '../provider.interface';

@Injectable()
export class HunterAdapter implements ILeadProviderAdapter {
  readonly provider = 'hunter';

  catalogEntry(): ProviderCatalogEntry {
    return {
      provider: 'hunter',
      label: 'Hunter.io',
      category: 'B2B Database',
      description: 'Find and verify email addresses for any company',
      costNote: '$49/mo — use your own key',
      requiresKey: true,
    };
  }

  async testKey(key: string): Promise<TestKeyResult> {
    try {
      const res = await fetch(`https://api.hunter.io/v2/account?api_key=${key}`);
      const data = await res.json() as any;
      if (data?.data?.email) return { valid: true };
      return { valid: false, error: data?.errors?.[0]?.details ?? 'Invalid key' };
    } catch {
      return { valid: false, error: 'Network error' };
    }
  }

  async search(filters: SearchFilters, apiKey?: string): Promise<NormalizedLead[]> {
    if (!apiKey) return [];

    const keyword = filters.niche ?? filters.keyword ?? 'saas';
    const res = await fetch(
      `https://api.hunter.io/v2/companies/suggest?query=${encodeURIComponent(keyword)}&limit=${filters.limit ?? 20}&api_key=${apiKey}`,
    );
    if (!res.ok) return [];

    const data = await res.json() as any;
    const companies = data.data?.companies ?? [];

    return companies.map((c: any) => ({
      source: 'hunter',
      businessName: c.name,
      website: c.domain ? `https://${c.domain}` : undefined,
      location: c.country,
      companySize: c.size,
      intentSignals: ['email_database'],
      intentScore: 12,
    } as NormalizedLead));
  }
}

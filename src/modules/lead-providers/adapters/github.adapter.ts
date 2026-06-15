import { Injectable } from '@nestjs/common';
import { ILeadProviderAdapter, NormalizedLead, SearchFilters, TestKeyResult, ProviderCatalogEntry } from '../provider.interface';

@Injectable()
export class GithubAdapter implements ILeadProviderAdapter {
  readonly provider = 'github';

  catalogEntry(): ProviderCatalogEntry {
    return {
      provider: 'github',
      label: 'GitHub',
      category: 'Startups & Tech',
      description: 'Find open-source orgs, tech startups, and active developers',
      costNote: 'Free with PAT (60 req/min)',
      requiresKey: true,
    };
  }

  async testKey(key: string): Promise<TestKeyResult> {
    try {
      const res = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${key}`, 'User-Agent': 'ClearWork-LeadFinder' },
      });
      if (res.ok) return { valid: true };
      return { valid: false, error: `GitHub returned ${res.status}` };
    } catch {
      return { valid: false, error: 'Network error' };
    }
  }

  async search(filters: SearchFilters, apiKey?: string): Promise<NormalizedLead[]> {
    const query = [filters.niche, filters.keyword, filters.location].filter(Boolean).join(' ') || 'saas startup';
    const limit = Math.min(filters.limit ?? 30, 100);

    const headers: Record<string, string> = { 'User-Agent': 'ClearWork-LeadFinder' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

    const res = await fetch(
      `https://api.github.com/search/users?q=${encodeURIComponent(query + ' type:org')}&per_page=${limit}`,
      { headers },
    );
    if (!res.ok) return [];

    const data = await res.json() as { items?: any[] };
    const items = data.items ?? [];

    const leads: NormalizedLead[] = await Promise.all(
      items.slice(0, 20).map(async (item: any) => {
        try {
          const orgRes = await fetch(`https://api.github.com/orgs/${item.login}`, { headers });
          const org = orgRes.ok ? await orgRes.json() : {};
          return {
            source: 'github',
            businessName: org.name ?? item.login,
            website: org.blog ?? `https://github.com/${item.login}`,
            email: org.email ?? undefined,
            location: org.location ?? undefined,
            contactName: undefined,
            intentSignals: ['github_org'],
            intentScore: 10,
          } as NormalizedLead;
        } catch {
          return {
            source: 'github',
            businessName: item.login,
            website: `https://github.com/${item.login}`,
            intentSignals: ['github_org'],
            intentScore: 10,
          } as NormalizedLead;
        }
      }),
    );
    return leads;
  }
}

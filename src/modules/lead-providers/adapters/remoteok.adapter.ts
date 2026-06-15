import { Injectable } from '@nestjs/common';
import { ILeadProviderAdapter, NormalizedLead, SearchFilters, TestKeyResult, ProviderCatalogEntry } from '../provider.interface';

@Injectable()
export class RemoteOkAdapter implements ILeadProviderAdapter {
  readonly provider = 'remoteok';

  catalogEntry(): ProviderCatalogEntry {
    return {
      provider: 'remoteok',
      label: 'RemoteOK',
      category: 'Job Boards',
      description: 'Companies actively hiring remotely — strong hiring intent signal',
      costNote: 'Free — no key needed',
      requiresKey: false,
    };
  }

  async testKey(_key: string): Promise<TestKeyResult> {
    return { valid: true };
  }

  async search(filters: SearchFilters, _apiKey?: string): Promise<NormalizedLead[]> {
    const res = await fetch('https://remoteok.com/api?tag=saas', {
      headers: { 'User-Agent': 'ClearWork-LeadFinder' },
    });
    if (!res.ok) return [];

    const data = await res.json() as any[];
    const jobs = data.filter((j: any) => j.company);
    const keyword = (filters.niche ?? filters.keyword ?? '').toLowerCase();

    const filtered = keyword
      ? jobs.filter((j: any) =>
          j.position?.toLowerCase().includes(keyword) ||
          j.company?.toLowerCase().includes(keyword) ||
          (j.tags ?? []).some((t: string) => t.toLowerCase().includes(keyword)),
        )
      : jobs;

    const seen = new Set<string>();
    const leads: NormalizedLead[] = [];

    for (const job of filtered.slice(0, filters.limit ?? 50)) {
      const company = job.company as string;
      if (!company || seen.has(company)) continue;
      seen.add(company);
      leads.push({
        source: 'remoteok',
        businessName: company,
        website: job.url ?? `https://remoteok.com`,
        location: 'Remote',
        intentSignals: ['actively_hiring', 'remote_company'],
        intentScore: 25,
      });
    }
    return leads;
  }
}

import { Injectable } from '@nestjs/common';
import { ILeadProviderAdapter, NormalizedLead, SearchFilters, TestKeyResult, ProviderCatalogEntry } from '../provider.interface';

@Injectable()
export class ProxycurlAdapter implements ILeadProviderAdapter {
  readonly provider = 'proxycurl';

  catalogEntry(): ProviderCatalogEntry {
    return {
      provider: 'proxycurl',
      label: 'Proxycurl',
      category: 'LinkedIn',
      description: 'LinkedIn profiles and company data via API',
      costNote: '$0.01/lookup — use your own key',
      requiresKey: true,
    };
  }

  async testKey(key: string): Promise<TestKeyResult> {
    try {
      const res = await fetch('https://nubela.co/proxycurl/api/credit-balance', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) return { valid: true };
      return { valid: false, error: `Proxycurl returned ${res.status}` };
    } catch {
      return { valid: false, error: 'Network error' };
    }
  }

  async search(filters: SearchFilters, apiKey?: string): Promise<NormalizedLead[]> {
    if (!apiKey) return [];

    const params = new URLSearchParams({
      country: 'IN',
      industry: filters.niche ?? 'Technology',
      page_size: String(Math.min(filters.limit ?? 10, 10)),
    });
    if (filters.companySize) params.set('employee_count_max', filters.companySize);

    const res = await fetch(`https://nubela.co/proxycurl/api/linkedin/company/search?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return [];

    const data = await res.json() as any;
    return (data.results ?? []).map((c: any) => ({
      source: 'proxycurl',
      businessName: c.name,
      website: c.website,
      linkedinUrl: c.url,
      location: c.hq?.city,
      companySize: c.company_size_on_linkedin?.toString(),
      intentSignals: ['linkedin_company'],
      intentScore: 18,
    } as NormalizedLead));
  }
}

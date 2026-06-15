import { Injectable } from '@nestjs/common';
import { ILeadProviderAdapter, NormalizedLead, SearchFilters, TestKeyResult, ProviderCatalogEntry } from '../provider.interface';

@Injectable()
export class ApolloAdapter implements ILeadProviderAdapter {
  readonly provider = 'apollo';

  catalogEntry(): ProviderCatalogEntry {
    return {
      provider: 'apollo',
      label: 'Apollo.io',
      category: 'B2B Database',
      description: 'Massive B2B contact & company database with email + phone',
      costNote: '$49/mo — use your own key',
      requiresKey: true,
    };
  }

  async testKey(key: string): Promise<TestKeyResult> {
    try {
      const res = await fetch('https://api.apollo.io/v1/auth/health', {
        headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
      });
      if (res.ok) return { valid: true };
      return { valid: false, error: `Apollo returned ${res.status}` };
    } catch {
      return { valid: false, error: 'Network error' };
    }
  }

  async search(filters: SearchFilters, apiKey?: string): Promise<NormalizedLead[]> {
    if (!apiKey) return [];

    const body: Record<string, any> = {
      per_page: Math.min(filters.limit ?? 50, 100),
      page: 1,
    };
    if (filters.niche) body.q_organization_keyword_tags = [filters.niche];
    if (filters.location) body.organization_locations = [filters.location];
    if (filters.jobTitle) body.person_titles = [filters.jobTitle];
    if (filters.companySize) body.organization_num_employees_ranges = [filters.companySize];

    const res = await fetch('https://api.apollo.io/v1/mixed_people/search', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];

    const data = await res.json() as any;
    const people = data.people ?? [];

    return people.map((p: any) => ({
      source: 'apollo',
      businessName: p.organization?.name,
      website: p.organization?.website_url,
      email: p.email,
      phone: p.phone_numbers?.[0]?.raw_number,
      contactName: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || undefined,
      contactTitle: p.title,
      companySize: p.organization?.employee_count?.toString(),
      location: p.organization?.city ?? p.city,
      linkedinUrl: p.linkedin_url,
      techStack: p.organization?.technology_names ?? [],
      intentSignals: ['b2b_database'],
      intentScore: 15,
    } as NormalizedLead));
  }
}

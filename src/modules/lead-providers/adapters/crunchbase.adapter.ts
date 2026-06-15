import { Injectable } from '@nestjs/common';
import { ILeadProviderAdapter, NormalizedLead, SearchFilters, TestKeyResult, ProviderCatalogEntry } from '../provider.interface';

@Injectable()
export class CrunchbaseAdapter implements ILeadProviderAdapter {
  readonly provider = 'crunchbase';

  catalogEntry(): ProviderCatalogEntry {
    return {
      provider: 'crunchbase',
      label: 'Crunchbase',
      category: 'Startups & Tech',
      description: 'Funded startups, founding team, and funding rounds',
      costNote: '$29/mo — use your own key',
      requiresKey: true,
    };
  }

  async testKey(key: string): Promise<TestKeyResult> {
    try {
      const res = await fetch(`https://api.crunchbase.com/api/v4/entities/organizations/apple?user_key=${key}&field_ids=short_description`);
      if (res.ok) return { valid: true };
      return { valid: false, error: `Crunchbase returned ${res.status}` };
    } catch {
      return { valid: false, error: 'Network error' };
    }
  }

  async search(filters: SearchFilters, apiKey?: string): Promise<NormalizedLead[]> {
    if (!apiKey) return [];

    const body = {
      field_ids: ['identifier', 'short_description', 'website_url', 'location_identifiers', 'num_employees_enum', 'funding_total'],
      query: [
        filters.niche
          ? { type: 'predicate', field_id: 'facet_ids', operator_id: 'includes', values: ['company'] }
          : { type: 'predicate', field_id: 'facet_ids', operator_id: 'includes', values: ['company'] },
      ],
      limit: Math.min(filters.limit ?? 25, 25),
    };

    const res = await fetch(`https://api.crunchbase.com/api/v4/searches/organizations?user_key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];

    const data = await res.json() as any;
    return (data.entities ?? []).map((e: any) => {
      const props = e.properties ?? {};
      return {
        source: 'crunchbase',
        businessName: props.identifier?.value,
        website: props.website_url,
        location: props.location_identifiers?.[0]?.value,
        companySize: props.num_employees_enum,
        intentSignals: props.funding_total?.value_usd ? ['funded_startup'] : ['startup'],
        intentScore: props.funding_total?.value_usd ? 35 : 15,
      } as NormalizedLead;
    });
  }
}

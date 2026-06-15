import { Injectable } from '@nestjs/common';
import { ILeadProviderAdapter, NormalizedLead, SearchFilters, TestKeyResult, ProviderCatalogEntry } from '../provider.interface';

@Injectable()
export class ProductHuntAdapter implements ILeadProviderAdapter {
  readonly provider = 'product_hunt';

  catalogEntry(): ProviderCatalogEntry {
    return {
      provider: 'product_hunt',
      label: 'Product Hunt',
      category: 'Startups & Tech',
      description: 'Recently launched tech startups and products',
      costNote: 'Free with developer token',
      requiresKey: true,
    };
  }

  async testKey(key: string): Promise<TestKeyResult> {
    try {
      const res = await fetch('https://api.producthunt.com/v2/api/graphql', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ viewer { user { id } } }' }),
      });
      if (res.ok) return { valid: true };
      return { valid: false, error: `Product Hunt returned ${res.status}` };
    } catch {
      return { valid: false, error: 'Network error' };
    }
  }

  async search(filters: SearchFilters, apiKey?: string): Promise<NormalizedLead[]> {
    if (!apiKey) return [];
    const topic = filters.niche ?? filters.keyword ?? 'saas';
    const query = `{
      posts(first: ${Math.min(filters.limit ?? 30, 50)}, topic: "${topic}") {
        edges {
          node {
            name
            tagline
            website
            makers { name profileImage twitterUsername }
          }
        }
      }
    }`;

    const res = await fetch('https://api.producthunt.com/v2/api/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!res.ok) return [];

    const data = await res.json() as any;
    const edges = data?.data?.posts?.edges ?? [];

    return edges.map((e: any) => {
      const post = e.node;
      const maker = post.makers?.[0];
      return {
        source: 'product_hunt',
        businessName: post.name,
        website: post.website,
        contactName: maker?.name,
        intentSignals: ['recently_launched', 'startup'],
        intentScore: 20,
      } as NormalizedLead;
    });
  }
}

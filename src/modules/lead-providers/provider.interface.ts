export interface NormalizedLead {
  source: string;
  businessName?: string;
  website?: string;
  email?: string;
  phone?: string;
  contactName?: string;
  contactTitle?: string;
  companySize?: string;
  location?: string;
  linkedinUrl?: string;
  techStack?: string[];
  intentSignals?: string[];
  intentScore?: number;
}

export interface SearchFilters {
  niche?: string;
  location?: string;
  jobTitle?: string;
  companySize?: string;
  keyword?: string;
  limit?: number;
}

export interface TestKeyResult {
  valid: boolean;
  error?: string;
}

export interface ProviderCatalogEntry {
  provider: string;
  label: string;
  category: string;
  description: string;
  costNote: string;
  requiresKey: boolean;
}

export interface ILeadProviderAdapter {
  readonly provider: string;
  catalogEntry(): ProviderCatalogEntry;
  testKey(key: string): Promise<TestKeyResult>;
  search(filters: SearchFilters, apiKey?: string): Promise<NormalizedLead[]>;
}

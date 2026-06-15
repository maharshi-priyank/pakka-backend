import { Injectable } from '@nestjs/common';
import { ILeadProviderAdapter, ProviderCatalogEntry } from './provider.interface';
import { GithubAdapter } from './adapters/github.adapter';
import { RemoteOkAdapter } from './adapters/remoteok.adapter';
import { ProductHuntAdapter } from './adapters/product-hunt.adapter';
import { ApolloAdapter } from './adapters/apollo.adapter';
import { HunterAdapter } from './adapters/hunter.adapter';
import { GoogleMapsAdapter } from './adapters/google-maps.adapter';
import { YelpAdapter } from './adapters/yelp.adapter';
import { ProxycurlAdapter } from './adapters/proxycurl.adapter';
import { CrunchbaseAdapter } from './adapters/crunchbase.adapter';

@Injectable()
export class LeadProvidersRegistry {
  private readonly adapters: Map<string, ILeadProviderAdapter>;

  constructor(
    github:      GithubAdapter,
    remoteOk:    RemoteOkAdapter,
    productHunt: ProductHuntAdapter,
    apollo:      ApolloAdapter,
    hunter:      HunterAdapter,
    googleMaps:  GoogleMapsAdapter,
    yelp:        YelpAdapter,
    proxycurl:   ProxycurlAdapter,
    crunchbase:  CrunchbaseAdapter,
  ) {
    const all = [github, remoteOk, productHunt, apollo, hunter, googleMaps, yelp, proxycurl, crunchbase];
    this.adapters = new Map(all.map(a => [a.provider, a]));
  }

  get(provider: string): ILeadProviderAdapter | undefined {
    return this.adapters.get(provider);
  }

  catalog(): ProviderCatalogEntry[] {
    return Array.from(this.adapters.values()).map(a => a.catalogEntry());
  }

  all(): ILeadProviderAdapter[] {
    return Array.from(this.adapters.values());
  }
}

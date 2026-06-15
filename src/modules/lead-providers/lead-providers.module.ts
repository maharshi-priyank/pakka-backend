import { Module } from '@nestjs/common';
import { LeadProvidersRegistry } from './provider-registry';
import { GithubAdapter } from './adapters/github.adapter';
import { RemoteOkAdapter } from './adapters/remoteok.adapter';
import { ProductHuntAdapter } from './adapters/product-hunt.adapter';
import { ApolloAdapter } from './adapters/apollo.adapter';
import { HunterAdapter } from './adapters/hunter.adapter';
import { GoogleMapsAdapter } from './adapters/google-maps.adapter';
import { YelpAdapter } from './adapters/yelp.adapter';
import { ProxycurlAdapter } from './adapters/proxycurl.adapter';
import { CrunchbaseAdapter } from './adapters/crunchbase.adapter';

const ADAPTERS = [
  GithubAdapter,
  RemoteOkAdapter,
  ProductHuntAdapter,
  ApolloAdapter,
  HunterAdapter,
  GoogleMapsAdapter,
  YelpAdapter,
  ProxycurlAdapter,
  CrunchbaseAdapter,
];

@Module({
  providers: [...ADAPTERS, LeadProvidersRegistry],
  exports: [LeadProvidersRegistry, ...ADAPTERS],
})
export class LeadProvidersModule {}

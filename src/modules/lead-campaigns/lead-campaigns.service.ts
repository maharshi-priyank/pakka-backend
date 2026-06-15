import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LeadVaultService } from '../lead-vault/lead-vault.service';
import { LeadProvidersRegistry } from '../lead-providers/provider-registry';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { NormalizedLead } from '../lead-providers/provider.interface';
import { CampaignStatus } from '@prisma/client';

@Injectable()
export class LeadCampaignsService {
  constructor(
    private readonly prisma:    PrismaService,
    private readonly vault:     LeadVaultService,
    private readonly registry:  LeadProvidersRegistry,
  ) {}

  async create(userId: string, dto: CreateCampaignDto) {
    const campaign = await this.prisma.leadCampaign.create({
      data: {
        userId,
        name: dto.name,
        filters: (dto.filters ?? {}) as any,
        providers: dto.providers,
        status: CampaignStatus.RUNNING,
      },
    });

    // Run in background — don't await so the response is immediate
    this.runCampaign(userId, campaign.id, dto).catch(() => {
      this.prisma.leadCampaign.update({
        where: { id: campaign.id },
        data: { status: CampaignStatus.FAILED },
      });
    });

    return campaign;
  }

  private async runCampaign(userId: string, campaignId: string, dto: CreateCampaignDto) {
    const filters = dto.filters ?? {};
    const perProvider = Math.ceil((filters.targetCount ?? 50) / dto.providers.length);

    const searchFilters = {
      niche:       filters.niche,
      location:    filters.location,
      jobTitle:    filters.jobTitle,
      companySize: filters.companySize,
      keyword:     filters.keyword,
      limit:       perProvider,
    };

    // Fetch from all providers in parallel
    const results = await Promise.allSettled(
      dto.providers.map(async (provider) => {
        const adapter = this.registry.get(provider);
        if (!adapter) return [];
        const apiKey = await this.vault.getDecryptedKey(userId, provider);
        // Free providers (remoteok) work without a key; others need it
        if (adapter.catalogEntry().requiresKey && !apiKey) return [];
        return adapter.search(searchFilters, apiKey ?? undefined);
      }),
    );

    const allLeads: NormalizedLead[] = results
      .filter((r): r is PromiseFulfilledResult<NormalizedLead[]> => r.status === 'fulfilled')
      .flatMap(r => r.value);

    // Deduplicate by website domain or email
    const seen = new Set<string>();
    const unique: NormalizedLead[] = [];
    for (const lead of allLeads) {
      const domainKey = lead.website ? new URL(lead.website.startsWith('http') ? lead.website : `https://${lead.website}`).hostname.replace('www.', '') : null;
      const key = lead.email ?? domainKey ?? lead.businessName ?? Math.random().toString();
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(lead);
      }
    }

    if (unique.length > 0) {
      await this.prisma.discoveredLead.createMany({
        data: unique.map(l => ({
          campaignId,
          userId,
          source:       l.source,
          businessName: l.businessName,
          website:      l.website,
          email:        l.email,
          phone:        l.phone,
          contactName:  l.contactName,
          contactTitle: l.contactTitle,
          companySize:  l.companySize,
          location:     l.location,
          linkedinUrl:  l.linkedinUrl,
          techStack:    l.techStack ?? [],
          intentSignals: l.intentSignals ?? [],
          intentScore:  l.intentScore ?? 0,
        })),
      });
    }

    await this.prisma.leadCampaign.update({
      where: { id: campaignId },
      data: { status: CampaignStatus.DONE, totalFound: unique.length },
    });
  }

  async findAll(userId: string) {
    return this.prisma.leadCampaign.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { leads: true } } },
    });
  }

  async findOne(userId: string, id: string) {
    const campaign = await this.prisma.leadCampaign.findFirst({
      where: { id, userId },
      include: {
        leads: { orderBy: { intentScore: 'desc' } },
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return campaign;
  }

  async delete(userId: string, id: string) {
    const campaign = await this.prisma.leadCampaign.findFirst({ where: { id, userId } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    await this.prisma.leadCampaign.delete({ where: { id } });
  }
}

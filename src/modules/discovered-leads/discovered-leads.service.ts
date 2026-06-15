import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryDiscoveredDto } from './dto/query-discovered.dto';

@Injectable()
export class DiscoveredLeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string, query: QueryDiscoveredDto) {
    const { campaignId, source, search, minScore, imported, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const where: any = { userId };
    if (campaignId) where.campaignId = campaignId;
    if (source)     where.source = source;
    if (minScore)   where.intentScore = { gte: minScore };
    if (imported === 'true')  where.importedAsLeadId = { not: null };
    if (imported === 'false') where.importedAsLeadId = null;
    if (search) {
      where.OR = [
        { businessName: { contains: search, mode: 'insensitive' } },
        { contactName:  { contains: search, mode: 'insensitive' } },
        { email:        { contains: search, mode: 'insensitive' } },
        { location:     { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.discoveredLead.findMany({ where, skip, take: limit, orderBy: { intentScore: 'desc' } }),
      this.prisma.discoveredLead.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async importToCrm(userId: string, id: string) {
    const discovered = await this.prisma.discoveredLead.findFirst({ where: { id, userId } });
    if (!discovered) throw new NotFoundException('Discovered lead not found');
    if (discovered.importedAsLeadId) {
      return { alreadyImported: true, leadId: discovered.importedAsLeadId };
    }

    const lead = await this.prisma.lead.create({
      data: {
        userId,
        name:    discovered.contactName ?? discovered.businessName ?? 'Unknown',
        email:   discovered.email,
        phone:   discovered.phone,
        company: discovered.businessName,
        source:  discovered.source,
        notes:   [
          discovered.website ? `Website: ${discovered.website}` : null,
          discovered.linkedinUrl ? `LinkedIn: ${discovered.linkedinUrl}` : null,
          discovered.location ? `Location: ${discovered.location}` : null,
          discovered.contactTitle ? `Title: ${discovered.contactTitle}` : null,
        ].filter(Boolean).join('\n') || null,
      },
    });

    await this.prisma.discoveredLead.update({
      where: { id },
      data: { importedAsLeadId: lead.id },
    });

    await this.prisma.leadCampaign.update({
      where: { id: discovered.campaignId },
      data: { totalImported: { increment: 1 } },
    });

    return { leadId: lead.id, alreadyImported: false };
  }

  async bulkImport(userId: string, ids: string[]) {
    const results = await Promise.allSettled(ids.map(id => this.importToCrm(userId, id)));
    const succeeded = results.filter(r => r.status === 'fulfilled').length;
    return { imported: succeeded, total: ids.length };
  }

  async exportCsv(userId: string, query: QueryDiscoveredDto): Promise<string> {
    const { items } = await this.findAll(userId, { ...query, limit: 5000 });
    const header = 'Business Name,Contact Name,Title,Email,Phone,Website,Location,Company Size,Source,Intent Score,LinkedIn\n';
    const rows = items.map(l =>
      [
        l.businessName, l.contactName, l.contactTitle, l.email, l.phone,
        l.website, l.location, l.companySize, l.source, l.intentScore, l.linkedinUrl,
      ].map(v => (v != null ? `"${String(v).replace(/"/g, '""')}"` : '')).join(','),
    );
    return header + rows.join('\n');
  }
}

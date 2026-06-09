import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdatePublicProfileDto } from './dto/update-public-profile.dto';
import { SubmitEnquiryDto } from './dto/submit-enquiry.dto';

function generateUsername(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 30);
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${base}-${suffix}`;
}

@Injectable()
export class PublicProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        publicUsername: true,
        publicProfileEnabled: true,
        publicUsernameChanged: true,
        publicBio: true,
        publicCity: true,
        publicWhatsapp: true,
        publicLanguages: true,
        publicSkills: true,
        publicServices: true,
        publicPortfolio: true,
        publicAccentColor: true,
        statsProjectsCompleted: true,
        statsTotalEarned: true,
        statsRepeatClientPct: true,
        statsAcceptanceRate: true,
        statsAvgResponseHrs: true,
        statsLastCalculatedAt: true,
        name: true,
        businessName: true,
        logoUrl: true,
        createdAt: true,
      },
    });
  }

  async updateMyProfile(userId: string, dto: UpdatePublicProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { publicUsername: true, publicUsernameChanged: true, name: true, businessName: true },
    });
    if (!user) throw new NotFoundException('User not found');

    let usernameToSet = user.publicUsername;

    // Auto-generate username when enabling for the first time
    if (dto.publicProfileEnabled && !user.publicUsername && !dto.publicUsername) {
      let candidate = generateUsername(user.businessName ?? user.name ?? 'freelancer');
      while (await this.prisma.user.count({ where: { publicUsername: candidate } })) {
        candidate = generateUsername(user.name ?? 'freelancer');
      }
      usernameToSet = candidate;
    }

    // Handle explicit username change — only allowed once
    if (dto.publicUsername && dto.publicUsername !== user.publicUsername) {
      if (user.publicUsernameChanged) {
        throw new BadRequestException('Username can only be changed once');
      }
      const exists = await this.prisma.user.count({
        where: { publicUsername: dto.publicUsername, id: { not: userId } },
      });
      if (exists) throw new ConflictException('Username already taken');
      usernameToSet = dto.publicUsername;
    }

    const { publicUsername: _ignore, ...rest } = dto;
    const data: Record<string, unknown> = { ...rest };

    if (usernameToSet !== user.publicUsername) {
      data.publicUsername = usernameToSet;
      if (user.publicUsername) {
        // They previously had a username and are changing it — mark as changed
        data.publicUsernameChanged = true;
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        publicUsername: true,
        publicProfileEnabled: true,
        publicUsernameChanged: true,
        publicBio: true,
        publicCity: true,
        publicWhatsapp: true,
        publicLanguages: true,
        publicSkills: true,
        publicServices: true,
        publicPortfolio: true,
        publicAccentColor: true,
      },
    });
  }

  async getPublicProfile(username: string) {
    const user = await this.prisma.user.findFirst({
      where: { publicUsername: username, publicProfileEnabled: true },
      select: {
        name: true,
        businessName: true,
        logoUrl: true,
        createdAt: true,
        publicBio: true,
        publicCity: true,
        publicWhatsapp: true,
        publicLanguages: true,
        publicSkills: true,
        publicServices: true,
        publicPortfolio: true,
        publicAccentColor: true,
        statsProjectsCompleted: true,
        statsTotalEarned: true,
        statsRepeatClientPct: true,
        statsAcceptanceRate: true,
        statsAvgResponseHrs: true,
        statsLastCalculatedAt: true,
      },
    });
    if (!user) throw new NotFoundException('Profile not found');
    return { username, ...user };
  }

  async submitEnquiry(username: string, dto: SubmitEnquiryDto) {
    const user = await this.prisma.user.findFirst({
      where: { publicUsername: username, publicProfileEnabled: true },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('Profile not found');

    return this.prisma.publicProfileEnquiry.create({
      data: { userId: user.id, ...dto },
    });
  }

  async recalculateStats() {
    const users = await this.prisma.user.findMany({
      where: { publicProfileEnabled: true },
      select: { id: true },
    });
    for (const { id } of users) {
      await this.recalculateUserStats(id);
    }
  }

  async recalculateUserStats(userId: string) {
    const [
      projectsCompleted,
      totalEarned,
      allClients,
      repeatClients,
      totalProposals,
      acceptedProposals,
      respondedLeads,
    ] = await Promise.all([
      this.prisma.project.count({ where: { userId, status: 'COMPLETED' } }),
      this.prisma.invoice.aggregate({
        where: { userId, status: 'PAID' },
        _sum: { total: true },
      }),
      this.prisma.project.groupBy({
        by: ['clientId'],
        where: { userId, status: 'COMPLETED', clientId: { not: null } },
        _count: true,
      }),
      this.prisma.project.groupBy({
        by: ['clientId'],
        where: { userId, status: 'COMPLETED', clientId: { not: null } },
        _count: { _all: true },
        having: { clientId: { _count: { gte: 2 } } },
      }),
      this.prisma.proposal.count({
        where: { userId, status: { in: ['SENT', 'OPENED', 'ACCEPTED', 'DECLINED', 'EXPIRED'] } },
      }),
      this.prisma.proposal.count({ where: { userId, status: 'ACCEPTED' } }),
      this.prisma.lead.findMany({
        where: { userId, isDeleted: false, stage: { not: 'ENQUIRY' } },
        select: { createdAt: true, updatedAt: true },
        take: 100,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const totalClientsWithProject = allClients.length;
    const repeatClientCount = repeatClients.length;
    const repeatPct =
      totalClientsWithProject > 0
        ? Math.round((repeatClientCount / totalClientsWithProject) * 100)
        : 0;

    const acceptancePct =
      totalProposals > 0 ? Math.round((acceptedProposals / totalProposals) * 100) : 0;

    let avgResponseHrs = 0;
    if (respondedLeads.length > 0) {
      const hours = respondedLeads.map(
        (l) => (l.updatedAt.getTime() - l.createdAt.getTime()) / (1000 * 60 * 60),
      );
      avgResponseHrs = Math.round(hours.reduce((a, b) => a + b, 0) / hours.length);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        statsProjectsCompleted: projectsCompleted,
        statsTotalEarned: Number(totalEarned._sum.total ?? 0),
        statsRepeatClientPct: repeatPct,
        statsAcceptanceRate: acceptancePct,
        statsAvgResponseHrs: avgResponseHrs,
        statsLastCalculatedAt: new Date(),
      },
    });
  }
}

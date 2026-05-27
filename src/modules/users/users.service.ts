import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AutomationsService } from '../automations/automations.service';
import { UpsertUserDto, UpdateUserDto } from './dto/upsert-user.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma:       PrismaService,
    private readonly automations:  AutomationsService,
  ) {}

  async upsert(dto: UpsertUserDto) {
    const user = await this.prisma.user.upsert({
      where:  { id: dto.id },
      update: { email: dto.email, name: dto.name },
      create: { id: dto.id, email: dto.email, name: dto.name },
    });

    // Idempotent — safe to call on every login
    await this.automations.seedDefaultRules(user.id);

    return user;
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async update(id: string, data: UpdateUserDto) {
    return this.prisma.user.update({ where: { id }, data });
  }

  async saveGoogleTokens(userId: string, tokens: { accessToken: string; refreshToken: string; expiresAt: Date }) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        googleAccessToken:       tokens.accessToken,
        googleRefreshToken:      tokens.refreshToken,
        googleTokenExpiresAt:    tokens.expiresAt,
        googleCalendarConnected: true,
      },
    });
  }

  async getGoogleTokens(userId: string) {
    return this.prisma.user.findUnique({
      where:  { id: userId },
      select: { googleAccessToken: true, googleRefreshToken: true, googleTokenExpiresAt: true },
    });
  }

  async clearGoogleTokens(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        googleAccessToken:       null,
        googleRefreshToken:      null,
        googleTokenExpiresAt:    null,
        googleCalendarConnected: false,
      },
    });
  }

  async saveOutlookTokens(userId: string, tokens: { accessToken: string; refreshToken: string; expiresAt: Date }) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        outlookAccessToken:    tokens.accessToken,
        outlookRefreshToken:   tokens.refreshToken,
        outlookTokenExpiresAt: tokens.expiresAt,
        outlookConnected:      true,
      },
    });
  }

  async getOutlookTokens(userId: string) {
    return this.prisma.user.findUnique({
      where:  { id: userId },
      select: { outlookAccessToken: true, outlookRefreshToken: true, outlookTokenExpiresAt: true },
    });
  }

  async clearOutlookTokens(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        outlookAccessToken:    null,
        outlookRefreshToken:   null,
        outlookTokenExpiresAt: null,
        outlookConnected:      false,
      },
    });
  }

  async redeemPromo(userId: string, code: string) {
    const promo = await this.prisma.promoCode.findUnique({ where: { code } });
    if (!promo || !promo.isActive) throw new NotFoundException('Invalid or expired promo code');

    const existing = await this.prisma.promoRedemption.findUnique({
      where: { codeId_userId: { codeId: promo.id, userId } },
    });
    if (existing) throw new BadRequestException('You have already used this promo code');

    const planExpiresAt = new Date();
    planExpiresAt.setDate(planExpiresAt.getDate() + 30);

    await this.prisma.$transaction([
      this.prisma.promoRedemption.create({ data: { codeId: promo.id, userId } }),
      this.prisma.user.update({ where: { id: userId }, data: { plan: promo.plan, planExpiresAt } }),
    ]);

    return { plan: promo.plan, expiresAt: planExpiresAt };
  }
}

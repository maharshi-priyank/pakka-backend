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

    // Ensure a workspace exists for this owner (idempotent)
    await this.prisma.workspace.upsert({
      where:  { id: dto.id },
      update: {},
      create: { id: dto.id, name: dto.name },
    });

    // Ensure owner WorkspaceMember row exists (idempotent)
    await this.prisma.workspaceMember.upsert({
      where:  { userId_workspaceId: { userId: dto.id, workspaceId: dto.id } },
      update: {},
      create: { user: { connect: { id: dto.id } }, workspace: { connect: { id: dto.id } }, role: 'OWNER', workspaceRole: { connect: { key: 'OWNER' } } },
    });

    // Set activeWorkspaceId if not yet set
    if (!user.activeWorkspaceId) {
      await this.prisma.user.update({
        where: { id: dto.id },
        data:  { activeWorkspaceId: dto.id },
      });
    }

    // Idempotent — safe to call on every login
    await this.automations.seedDefaultRules(user.id);

    return user;
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async getMe(id: string) {
    const user = await this.prisma.user.findUnique({
      where:   { id },
      include: { activeWorkspace: true },
    });
    return user;
  }

  async update(id: string, data: UpdateUserDto) {
    const user = await this.prisma.user.update({ where: { id }, data });

    // Keep active workspace logo in sync when profile logo changes
    if ('logoUrl' in data && data.logoUrl !== undefined) {
      const workspaceId = user.activeWorkspaceId ?? id;
      await this.prisma.workspace.update({
        where: { id: workspaceId },
        data:  { logoUrl: data.logoUrl },
      });
    }

    return user;
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

  async saveGoogleDocsConnected(userId: string, connected: boolean) {
    return this.prisma.user.update({
      where: { id: userId },
      data:  { googleDocsConnected: connected },
    });
  }

  async saveGoogleSheetsConnected(userId: string, connected: boolean, sheetId: string | null) {
    return this.prisma.user.update({
      where: { id: userId },
      data:  { googleSheetsConnected: connected, googleSheetsId: sheetId },
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

  async saveClickUpTokens(userId: string, tokens: { accessToken: string; workspaceId: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        clickUpAccessToken: tokens.accessToken,
        clickUpWorkspaceId: tokens.workspaceId,
        clickUpConnected:   true,
      },
    });
  }

  async getClickUpTokens(userId: string) {
    return this.prisma.user.findUnique({
      where:  { id: userId },
      select: { clickUpAccessToken: true, clickUpWorkspaceId: true },
    });
  }

  async clearClickUpTokens(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        clickUpAccessToken: null,
        clickUpWorkspaceId: null,
        clickUpConnected:   false,
      },
    });
  }

  async saveCanvaTokens(userId: string, tokens: { accessToken: string; refreshToken: string; expiresAt: Date }) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        canvaAccessToken:    tokens.accessToken,
        canvaRefreshToken:   tokens.refreshToken,
        canvaTokenExpiresAt: tokens.expiresAt,
        canvaConnected:      true,
      },
    });
  }

  async getCanvaTokens(userId: string) {
    return this.prisma.user.findUnique({
      where:  { id: userId },
      select: { canvaAccessToken: true, canvaRefreshToken: true, canvaTokenExpiresAt: true },
    });
  }

  async clearCanvaTokens(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        canvaAccessToken:    null,
        canvaRefreshToken:   null,
        canvaTokenExpiresAt: null,
        canvaConnected:      false,
      },
    });
  }

  async saveCanvaPkce(userId: string, state: string, codeVerifier: string) {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    return this.prisma.user.update({
      where: { id: userId },
      data:  { canvaPkceState: state, canvaPkceVerifier: codeVerifier, canvaPkceExpiresAt: expiresAt },
    });
  }

  async consumeCanvaPkce(state: string): Promise<{ userId: string; codeVerifier: string } | null> {
    const user = await this.prisma.user.findFirst({
      where:  { canvaPkceState: state },
      select: { id: true, canvaPkceVerifier: true, canvaPkceExpiresAt: true },
    });
    if (!user || !user.canvaPkceVerifier) return null;
    if (user.canvaPkceExpiresAt && user.canvaPkceExpiresAt < new Date()) return null;

    // Clear PKCE fields after consuming (one-time use)
    await this.prisma.user.update({
      where: { id: user.id },
      data:  { canvaPkceState: null, canvaPkceVerifier: null, canvaPkceExpiresAt: null },
    });

    return { userId: user.id, codeVerifier: user.canvaPkceVerifier };
  }

  async saveFlodeskApiKey(userId: string, apiKey: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data:  { flodeskApiKey: apiKey, flodeskConnected: true },
    });
  }

  async getFlodeskApiKey(userId: string) {
    return this.prisma.user.findUnique({
      where:  { id: userId },
      select: { flodeskApiKey: true },
    });
  }

  async clearFlodeskApiKey(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data:  { flodeskApiKey: null, flodeskConnected: false },
    });
  }

  async redeemPromo(userId: string, code: string) {
    const promo = await this.prisma.promoCode.findUnique({
      where: { code },
      include: { _count: { select: { redemptions: true } } },
    });
    if (!promo || !promo.isActive) throw new NotFoundException('Invalid or expired promo code');

    const existing = await this.prisma.promoRedemption.findUnique({
      where: { codeId_workspaceId: { codeId: promo.id, workspaceId: userId } },
    });
    if (existing) throw new BadRequestException('You have already used this promo code');

    if (promo.maxRedemptions !== null && promo._count.redemptions >= promo.maxRedemptions) {
      throw new BadRequestException('This promo code has reached its maximum redemptions');
    }

    // durationMonths null = permanent (planExpiresAt = null)
    let planExpiresAt: Date | null = null;
    if (promo.durationMonths !== null) {
      planExpiresAt = new Date();
      planExpiresAt.setMonth(planExpiresAt.getMonth() + promo.durationMonths);
    }

    await this.prisma.$transaction([
      this.prisma.promoRedemption.create({ data: { codeId: promo.id, workspaceId: userId } }),
      this.prisma.user.update({ where: { id: userId }, data: { plan: promo.plan, planExpiresAt } }),
    ]);

    return { plan: promo.plan, expiresAt: planExpiresAt };
  }
}

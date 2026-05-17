import { Injectable } from '@nestjs/common';
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
}

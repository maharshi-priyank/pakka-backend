import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { AdminUserStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AdminJwtPayload } from './admin-jwt.strategy';

export interface AdminLoginMetadata {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, metadata: AdminLoginMetadata = {}): Promise<{ token: string }> {
    const normalizedEmail = email.toLowerCase();
    const admin = await this.prisma.adminUser.findUnique({
      where: { email: normalizedEmail },
    });
    if (!admin) {
      await this.recordSecurityEvent({ email: normalizedEmail, outcome: 'FAILURE', ...metadata });
      throw new UnauthorizedException('Invalid admin credentials.');
    }

    if ((admin.status !== undefined && admin.status !== AdminUserStatus.ACTIVE) || (admin.lockedUntil && admin.lockedUntil > new Date())) {
      await this.recordSecurityEvent({ adminId: admin.id, email: normalizedEmail, outcome: 'FAILURE', ...metadata });
      throw new UnauthorizedException('Admin account is unavailable.');
    }

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) {
      const failedLoginCount = (admin.failedLoginCount ?? 0) + 1;
      await this.prisma.adminUser.update({
        where: { id: admin.id },
        data: {
          failedLoginCount,
          lockedUntil: failedLoginCount >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null,
        },
      });
      await this.recordSecurityEvent({ adminId: admin.id, email: normalizedEmail, outcome: 'FAILURE', ...metadata });
      throw new UnauthorizedException('Invalid admin credentials.');
    }

    const jti = randomUUID();
    const expiresIn = this.config.get<string>('admin.jwtExpiresIn') ?? '8h';
    const expiresAt = new Date(Date.now() + this.durationMs(expiresIn));
    const payload: AdminJwtPayload = {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      jti,
    };
    const token = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('admin.jwtSecret'),
      expiresIn: expiresIn as never,
    });

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    });
    const sessionStore = (this.prisma as PrismaService & { adminSession?: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> } }).adminSession;
    if (sessionStore?.create) {
      await sessionStore.create({
        data: {
          adminId: admin.id,
          jti,
          expiresAt,
          ipAddress: metadata.ipAddress?.slice(0, 120) ?? null,
          userAgent: metadata.userAgent?.slice(0, 500) ?? null,
        },
      });
    }

    await this.audit.log({
      adminId: admin.id,
      adminRole: admin.role,
      targetType: 'admin',
      targetId: admin.id,
      action: 'admin.login',
    });

    await this.recordSecurityEvent({ adminId: admin.id, email: normalizedEmail, outcome: 'SUCCESS', ...metadata });

    return { token };
  }

  async logout(adminId: string, sessionJti?: string) {
    if (!sessionJti) return { loggedOut: true };
    const sessionStore = (this.prisma as PrismaService & { adminSession?: { updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown> } }).adminSession;
    if (sessionStore?.updateMany) {
      await sessionStore.updateMany({
        where: { adminId, jti: sessionJti, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'admin logout' },
      });
    }
    return { loggedOut: true };
  }

  /** Hash a password — used by an admin-provisioning seed/script, not the API. */
  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 12);
  }

  private durationMs(value: string) {
    const match = /^([0-9]+)\s*(s|m|h|d)$/i.exec(value.trim());
    if (!match) return 8 * 60 * 60 * 1000;
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    const multiplier = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
    return amount * multiplier;
  }

  private async recordSecurityEvent(event: {
    adminId?: string;
    email: string;
    outcome: 'SUCCESS' | 'FAILURE';
    ipAddress?: string;
    userAgent?: string;
  }) {
    const prisma = this.prisma as PrismaService & {
      adminSecurityEvent?: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
    };
    if (!prisma.adminSecurityEvent) return;
    try {
      await prisma.adminSecurityEvent.create({
        data: {
          adminId: event.adminId ?? null,
          email: event.email,
          outcome: event.outcome,
          ipAddress: event.ipAddress?.slice(0, 120) ?? null,
          userAgent: event.userAgent?.slice(0, 500) ?? null,
        },
      });
    } catch (error) {
      this.logger.warn(`Failed to record admin security event: ${(error as Error).message}`);
    }
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { AdminUserStatus } from '@prisma/client';

export interface AdminJwtPayload {
  sub: string; // AdminUser id
  email: string;
  role: string; // AdminRole
  jti: string;
}

/**
 * Verifies the admin JWT signed with the backend-held ADMIN_JWT_SECRET
 * (symmetric — distinct from the Supabase JWKS path used for tenant JWTs).
 * Resolves the AdminUser and stamps it on request.admin. Never resolves a
 * tenant User. Used by AdminGuard on /admin/** routes.
 */
@Injectable()
export class AdminJwtStrategy extends PassportStrategy(
  Strategy,
  'admin-jwt',
) {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = config.get<string>('admin.jwtSecret');
    if (!secret) {
      // Fail loudly at boot if the admin secret is unset — admin auth cannot work.
      throw new Error('ADMIN_JWT_SECRET is not configured.');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: AdminJwtPayload) {
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: payload.sub },
    });
    if (!admin) {
      throw new UnauthorizedException('Admin account not found.');
    }
    if (admin.status !== AdminUserStatus.ACTIVE) {
      throw new UnauthorizedException('Admin account is not active.');
    }
    const session = await this.prisma.adminSession.findUnique({ where: { jti: payload.jti } });
    if (!session || session.adminId !== admin.id || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException('Admin session is no longer valid.');
    }
    await this.prisma.adminSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    // Stamp on request.admin (distinct from request.user, which holds tenant users).
    return { ...admin, sessionJti: payload.jti };
  }
}

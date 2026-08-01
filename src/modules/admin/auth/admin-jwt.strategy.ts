import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';

export interface AdminJwtPayload {
  sub: string; // AdminUser id
  email: string;
  role: string; // AdminRole
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
    // Stamp on request.admin (distinct from request.user, which holds tenant users).
    return admin;
  }
}

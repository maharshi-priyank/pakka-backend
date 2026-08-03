import {
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AdminUser } from '@prisma/client';

export interface ImpersonationToken {
  token: string;
  expiresAt: number; // epoch ms
}

/**
 * Impersonation (R13, KTD5). A superadmin mints a short-lived token signed with
 * the backend-held ADMIN_IMPERSONATION_SECRET (a deliberately-widened second
 * issuer — the backend cannot mint Supabase-JWKS-verifiable tokens). The token
 * carries sub=tenantUserId, imp=adminId, jti, exp; JwtStrategy verifies it on
 * tenant endpoints only and stamps request.impersonatedBy.
 */
@Injectable()
export class AdminImpersonationService {
  private readonly logger = new Logger(AdminImpersonationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async mintForUser(admin: AdminUser, userId: string): Promise<ImpersonationToken> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) throw new NotFoundException('Tenant user not found.');

    const secret = this.config.getOrThrow<string>('admin.impersonationSecret');
    const expiresIn = this.config.get<string>('admin.impersonationExpiresIn') ?? '15m';
    const expiresAt = Date.now() + this.parseExpiryMs(expiresIn);
    const jti = `imp-${admin.id}-${userId}-${Date.now()}`;

    const token = await this.jwt.signAsync(
      { sub: user.id, imp: admin.id, jti },
      { secret, expiresIn: expiresIn as never },
    );

    await this.audit.log({
      adminId: admin.id,
      adminRole: admin.role,
      targetType: 'user',
      targetId: user.id,
      action: 'admin.impersonate.start',
      after: { jti, expiresAt },
    });

    return { token, expiresAt };
  }

  private parseExpiryMs(s: string): number {
    const m = /^(\d+)([smhd])$/.exec(s);
    if (!m) return 15 * 60_000;
    const n = parseInt(m[1], 10);
    const unit = m[2];
    const factors: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return n * (factors[unit] ?? 60_000);
  }
}

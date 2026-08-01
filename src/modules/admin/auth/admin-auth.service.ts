import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AdminJwtPayload } from './admin-jwt.strategy';

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string): Promise<{ token: string }> {
    const admin = await this.prisma.adminUser.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!admin) throw new UnauthorizedException('Invalid admin credentials.');

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid admin credentials.');

    const payload: AdminJwtPayload = {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
    };
    const token = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('admin.jwtSecret'),
      expiresIn: (this.config.get<string>('admin.jwtExpiresIn') ?? '8h') as never,
    });

    await this.prisma.adminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    await this.audit.log({
      adminId: admin.id,
      adminRole: admin.role,
      targetType: 'admin',
      targetId: admin.id,
      action: 'admin.login',
    });

    return { token };
  }

  /** Hash a password — used by an admin-provisioning seed/script, not the API. */
  async hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 12);
  }
}

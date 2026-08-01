import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminJwtStrategy } from './auth/admin-jwt.strategy';
import { AdminAuthService } from './auth/admin-auth.service';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AuditService } from './audit/audit.service';

/**
 * Admin module — superadmin-only panel API.
 *
 * Controllers under /admin/** are marked @Public() so the global JwtAuthGuard
 * (Supabase JWKS) and WorkspacePermissionGuard skip them; each admin controller
 * applies @UseGuards(AdminGuard) as its sole authz authority. Admin identity is
 * separate from tenant User accounts (AdminUser table + own admin JWT signed
 * with ADMIN_JWT_SECRET).
 *
 * Submodules (oversight, users, workspaces, actions, billing, audit-read,
 * impersonation) register their controllers/providers here as they are built.
 */
@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // Default secret for JwtService; admin login overrides per-call with the
        // same secret. Impersonation uses a separate secret (admin.impersonationSecret).
        secret: config.get<string>('admin.jwtSecret') ?? 'dev-admin-secret',
      }),
    }),
  ],
  controllers: [AdminAuthController],
  providers: [AdminJwtStrategy, AdminAuthService, AuditService],
  exports: [AuditService, AdminAuthService, JwtModule, PassportModule],
})
export class AdminModule {}

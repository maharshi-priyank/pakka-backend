import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminJwtStrategy } from './auth/admin-jwt.strategy';
import { AdminAuthService } from './auth/admin-auth.service';
import { AdminAuthController } from './auth/admin-auth.controller';
import { AuditService } from './audit/audit.service';
import { AdminOversightService } from './oversight/admin-oversight.service';
import { AdminOversightController } from './oversight/admin-oversight.controller';
import { AdminUsersService } from './users/admin-users.service';
import { AdminUsersController } from './users/admin-users.controller';
import { AdminWorkspacesService } from './workspaces/admin-workspaces.service';
import { AdminWorkspacesController } from './workspaces/admin-workspaces.controller';

/**
 * Admin module — superadmin-only panel API.
 *
 * Controllers under /admin/** are marked @Public() so the global JwtAuthGuard
 * (Supabase JWKS) and WorkspacePermissionGuard skip them; each admin controller
 * applies @UseGuards(AdminGuard) as its sole authz authority. Admin identity is
 * separate from tenant User accounts (AdminUser table + own admin JWT signed
 * with ADMIN_JWT_SECRET).
 *
 * Remaining submodules (actions, billing, audit-read, impersonation) register
 * here as they are built (U4–U6).
 */
@Module({
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('admin.jwtSecret') ?? 'dev-admin-secret',
      }),
    }),
  ],
  controllers: [
    AdminAuthController,
    AdminOversightController,
    AdminUsersController,
    AdminWorkspacesController,
  ],
  providers: [
    AdminJwtStrategy,
    AdminAuthService,
    AuditService,
    AdminOversightService,
    AdminUsersService,
    AdminWorkspacesService,
  ],
  exports: [AuditService, AdminAuthService, JwtModule, PassportModule],
})
export class AdminModule {}

import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';

/**
 * Admin module — superadmin-only panel API.
 *
 * Controllers under /admin/** are marked @Public() so the global JwtAuthGuard
 * (Supabase JWKS) and WorkspacePermissionGuard skip them; each admin controller
 * applies @UseGuards(AdminGuard) as its sole authz authority. Admin identity is
 * separate from tenant User accounts (AdminUser table + own admin JWT).
 *
 * Submodules (auth, oversight, users, workspaces, actions, billing, audit,
 * impersonation) are registered here as they are built.
 */
@Module({
  imports: [PrismaModule],
  providers: [],
  controllers: [],
  exports: [],
})
export class AdminModule {}

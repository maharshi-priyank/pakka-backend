import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { AdminRole } from '@prisma/client';
import { ADMIN_TIER_KEY, type AdminTier } from '../decorators/require-admin.decorator';

/**
 * Sole authz authority for /admin/** routes. Those routes are marked @Public()
 * so the global JwtAuthGuard (Supabase JWKS) and WorkspacePermissionGuard skip
 * them; AdminGuard runs via @UseGuards(AdminGuard), authenticates the admin
 * JWT via the 'admin-jwt' Passport strategy (resolves AdminUser onto
 * request.user), then enforces the @RequireAdmin tier hierarchically
 * (SUPERADMIN satisfies any tier).
 */
@Injectable()
export class AdminGuard extends AuthGuard('admin-jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Authenticate: runs AdminJwtStrategy, throws 401 on bad/expired/missing
    // admin JWT, resolves AdminUser onto request.user. A tenant Supabase JWT
    // is signed with a different secret and fails verification here.
    await super.canActivate(context);

    const required = this.reflector.getAllAndOverride<AdminTier>(
      ADMIN_TIER_KEY,
      [context.getHandler(), context.getClass()],
    );

    const request = context.switchToHttp().getRequest();
    const admin = request.user as
      | { id: string; role: AdminRole }
      | undefined;

    if (!admin) throw new UnauthorizedException('Admin authentication required.');

    if (!required) return true; // any authenticated admin

    const requiredRole =
      required === 'superadmin' ? AdminRole.SUPERADMIN : AdminRole.SUPPORT;
    if (admin.role === AdminRole.SUPERADMIN) return true; // hierarchical
    if (requiredRole === AdminRole.SUPPORT && admin.role === AdminRole.SUPPORT)
      return true;

    throw new ForbiddenException('Insufficient admin role.');
  }
}

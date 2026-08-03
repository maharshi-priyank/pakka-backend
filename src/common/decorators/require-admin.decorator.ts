import { SetMetadata } from '@nestjs/common';

export const ADMIN_TIER_KEY = 'admin_tier';
export type AdminTier = 'superadmin' | 'support';

/**
 * Marks a route as requiring an admin of the given tier or higher
 * (superadmin satisfies any tier). Applied alongside @Public() on /admin/**
 * controllers so the global JwtAuthGuard/WorkspacePermissionGuard skip the
 * route, and @UseGuards(AdminGuard) is the sole authz authority.
 */
export const RequireAdmin = (tier: AdminTier) => SetMetadata(ADMIN_TIER_KEY, tier);

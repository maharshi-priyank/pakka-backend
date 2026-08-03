import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AdminUser } from '@prisma/client';

/**
 * Reads the AdminUser that AdminGuard (via AdminJwtStrategy) stamped on
 * request.user. Only valid on /admin/** routes guarded by AdminGuard.
 */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AdminUser;
  },
);

import { Injectable, ExecutionContext, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_JWT_PAYLOAD_ONLY_KEY } from '../decorators/jwt-payload-only.decorator';
import { ImpersonationVerifier } from '../../modules/admin/impersonation/impersonation.guard';

/**
 * Global auth guard. Order:
 *  1. @Public() -> skip (admin controllers use this + their own AdminGuard).
 *  2. Impersonation token (imp claim) -> ImpersonationVerifier stamps
 *     request.user (tenant user) + request.impersonatedBy and returns.
 *  3. @JwtPayloadOnly() -> jwt-payload strategy (no DB lookup).
 *  4. Otherwise -> Supabase JWKS JwtStrategy.
 *
 * ImpersonationVerifier is @Optional() so the guard still constructs if the
 * admin module is absent (e.g. in isolated tests); when present, imp-bearing
 * tokens are honored on tenant routes and rejected on /admin/**.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly payloadGuard = new (AuthGuard('jwt-payload'))();

  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly impersonation?: ImpersonationVerifier,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    if (this.impersonation) {
      const handled = await this.impersonation.tryHandle(context);
      if (handled) return true; // imp token verified + stamped; skip JWKS
    }

    const isPayloadOnly = this.reflector.getAllAndOverride<boolean>(IS_JWT_PAYLOAD_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPayloadOnly) return this.payloadGuard.canActivate(context);

    return super.canActivate(context);
  }
}

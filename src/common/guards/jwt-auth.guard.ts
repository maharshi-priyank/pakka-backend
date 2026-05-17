import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_JWT_PAYLOAD_ONLY_KEY } from '../decorators/jwt-payload-only.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  // Lazily created — reuses the same instance across requests
  private readonly payloadGuard = new (AuthGuard('jwt-payload'))();

  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    // Routes decorated with @JwtPayloadOnly() validate the JWT but skip the DB lookup.
    // Auth still always goes through this guard — no route-level @UseGuards needed.
    const isPayloadOnly = this.reflector.getAllAndOverride<boolean>(IS_JWT_PAYLOAD_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPayloadOnly) return this.payloadGuard.canActivate(context);

    return super.canActivate(context);
  }
}

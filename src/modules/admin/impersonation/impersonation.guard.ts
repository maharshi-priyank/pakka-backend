import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConsumedJtiStore } from './consumed-jti.store';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { Reflector } from '@nestjs/core';

/**
 * Detects impersonation tokens (imp-bearing) and, when present on a tenant
 * route, verifies them with ADMIN_IMPERSONATION_SECRET, resolves the tenant
 * user onto request.user, stamps request.impersonatedBy, and consumes the jti
 * (replay guard). This guard is NOT a global APP_GUARD (ordering with the
 * existing JwtAuthGuard is fragile); instead JwtAuthGuard delegates to it via
 * the ImpersonationVerifier below when the bearer token decodes with an `imp`
 * claim. Honored only on tenant endpoints — never on /admin/** (those use
 * AdminGuard + admin JWT).
 */
@Injectable()
export class ImpersonationVerifier {
  private readonly logger = new Logger(ImpersonationVerifier.name);
  private readonly secret: string | undefined;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly jtiStore: ConsumedJtiStore,
    private readonly reflector: Reflector,
  ) {
    this.secret = this.config.get<string>('admin.impersonationSecret');
  }

  /**
   * If the bearer token is an impersonation token, verify + stamp and return
   * true (handled). Returns false if it is not an impersonation token (caller
   * falls through to normal JWKS auth).
   */
  async tryHandle(context: ExecutionContext): Promise<boolean> {
    if (!this.secret) return false;
    const request = context.switchToHttp().getRequest();
    const auth = request?.headers?.authorization as string | undefined;
    if (!auth?.startsWith('Bearer ')) return false;
    const token = auth.slice(7);

    // Decode without verifying to inspect for an `imp` claim.
    let decoded: { imp?: string; sub?: string; jti?: string };
    try {
      decoded = this.jwt.decode(token) as typeof decoded;
    } catch {
      return false;
    }
    if (!decoded || !decoded.imp) return false;

    // Impersonation tokens are honored only on tenant routes (not /admin/**).
    // /admin/** controllers are @Public(); an imp token there is a misuse.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const path: string = request.url ?? '';
    if (isPublic || path.startsWith('/api/admin') || path.includes('/admin/')) {
      throw new UnauthorizedException('Impersonation tokens are not honored on admin routes.');
    }

    // Verify with the impersonation secret (symmetric), enforce expiry.
    let payload: { sub: string; imp: string; jti: string; exp?: number };
    try {
      payload = (await this.jwt.verifyAsync(token, { secret: this.secret })) as typeof payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired impersonation token.');
    }

    // Replay guard: consume jti once.
    if (!payload.jti || !this.jtiStore.consume(payload.jti, payload.exp ? payload.exp * 1000 : undefined)) {
      throw new UnauthorizedException('Impersonation token already used or replayed.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException('Impersonated user not found.');

    request.user = user; // tenant user, as if they logged in
    request.impersonatedBy = payload.imp; // admin id, for the audit interceptor
    return true;
  }
}

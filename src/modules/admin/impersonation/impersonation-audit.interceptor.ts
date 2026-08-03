import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { AuditService } from '../audit/audit.service';
import type { User } from '@prisma/client';

/**
 * Audits tenant actions performed under an impersonation token (R13/AE5).
 * Fires whenever request.impersonatedBy is set (by ImpersonationVerifier),
 * regardless of HTTP method — not only writes. The audit entry is attributed
 * to the admin (impersonatedBy), not the impersonated tenant user, so an action
 * taken "as" a user is never indistinguishable from the user's own action.
 *
 * Registered globally via APP_INTERCEPTOR in AdminModule. It is a no-op when
 * request.impersonatedBy is absent (normal tenant or admin requests).
 */
@Injectable()
export class ImpersonationAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(ImpersonationAuditInterceptor.name);

  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const adminId: string | undefined = request?.impersonatedBy;
    if (!adminId) return next.handle(); // not an impersonated request

    const method: string = request?.method ?? '';
    const url: string = request?.url ?? '';
    const user: User | undefined = request?.user;
    const tenantUserId = user?.id;

    return next.handle().pipe(
      tap(() => {
        // Fire-and-forget; AuditService swallows errors so the tenant action is unaffected.
        void this.audit
          .log({
            adminId,
            // Role resolved at mint time; the interceptor records the action with
            // the admin id — role is best-effort from the audit's admin lookup.
            adminRole: 'SUPERADMIN' as never,
            targetType: 'tenant_action',
            targetId: tenantUserId ?? null,
            action: `admin.impersonate.action:${method}`,
            after: { method, url },
          })
          .catch((e) => this.logger.error(`impersonation audit failed: ${(e as Error).message}`));
      }),
    );
  }
}

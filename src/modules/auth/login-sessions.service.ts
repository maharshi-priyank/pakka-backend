import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import type { Request } from 'express';
import { Prisma, type UserLoginSession } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface LoginSessionJwtPayload {
  sub: string;
  session_id?: string;
  jti?: string;
  iat?: number;
  exp?: number;
}

export interface CurrentLoginSession {
  id: string;
  providerSessionId: string | null;
  sessionFingerprint: string;
}

export type LoginSessionRequest = Request & {
  loginSession?: CurrentLoginSession;
  impersonatedBy?: unknown;
};

export type LoginDeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown';

export interface LoginSessionView {
  id: string;
  deviceName: string;
  deviceType: LoginDeviceType;
  browser: string;
  os: string;
  ipAddress: string | null;
  location: string | null;
  createdAt: Date;
  lastActiveAt: Date;
  isCurrent: boolean;
}

interface SessionIdentity {
  providerSessionId: string | null;
  sessionFingerprint: string;
}

interface DeviceMetadata {
  deviceId: string | null;
  deviceName: string;
  deviceType: LoginDeviceType;
  browser: string;
  os: string;
  ipAddress: string | null;
  location: string | null;
  userAgent: string | null;
}

interface ProviderSessionRow {
  id: string;
  createdAt: Date;
  refreshedAt: Date | null;
  userAgent: string | null;
  ipAddress: string | null;
}

const LAST_ACTIVE_WRITE_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class LoginSessionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Rejects a JWT whose Supabase session has already been revoked in ClearWork.
   * This is also used by the payload-only onboarding strategy before a User row
   * necessarily exists, so it intentionally does not create a record.
   */
  async assertNotRevoked(payload: LoginSessionJwtPayload): Promise<void> {
    const identity = this.identityFromPayload(payload);
    const existing = await this.findByIdentity(identity);
    if (!existing) return;

    if (existing.userId !== payload.sub || existing.revokedAt) {
      this.throwRevoked();
    }
  }

  /**
   * Registers the Supabase session on first use and updates its activity at a
   * throttled cadence. Tokens are never stored; only the non-secret session_id
   * claim (and a one-way fingerprint) are persisted.
   */
  async observe(
    userId: string,
    payload: LoginSessionJwtPayload,
    request: LoginSessionRequest,
  ): Promise<CurrentLoginSession> {
    const identity = this.identityFromPayload(payload);
    const metadata = this.deviceMetadata(request);
    let session = await this.findByIdentity(identity);

    if (!session) {
      try {
        session = await this.prisma.userLoginSession.create({
          data: {
            userId,
            providerSessionId: identity.providerSessionId,
            sessionFingerprint: identity.sessionFingerprint,
            ...metadata,
            tokenExpiresAt: this.tokenExpiry(payload.exp),
          },
        });
      } catch (error) {
        // Two first requests from a newly signed-in browser can race. Resolve
        // the winning row and continue instead of turning that race into a 500.
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        ) {
          throw error;
        }
        session = await this.findByIdentity(identity);
        if (!session) throw error;
      }
    }

    if (session.userId !== userId || session.revokedAt) {
      this.throwRevoked();
    }

    const now = new Date();
    if (
      now.getTime() - session.lastActiveAt.getTime() >=
      LAST_ACTIVE_WRITE_INTERVAL_MS
    ) {
      session = await this.prisma.userLoginSession.update({
        where: { id: session.id },
        data: {
          ...metadata,
          lastActiveAt: now,
          tokenExpiresAt: this.tokenExpiry(payload.exp),
        },
      });
      if (session.revokedAt) this.throwRevoked();
    }

    const current = this.toCurrentSession(session);
    request.loginSession = current;
    return current;
  }

  async list(
    userId: string,
    current: CurrentLoginSession,
  ): Promise<LoginSessionView[]> {
    await this.reconcileProviderSessions(userId, current);

    const sessions = await this.prisma.userLoginSession.findMany({
      where: { userId, revokedAt: null },
      orderBy: [{ lastActiveAt: 'desc' }, { createdAt: 'desc' }],
    });

    return sessions.map((session) => ({
      id: session.id,
      deviceName:
        session.deviceName ||
        `${session.browser || 'Browser'} on ${session.os || 'unknown device'}`,
      deviceType: this.normalizeDeviceType(session.deviceType),
      browser: session.browser || 'Unknown browser',
      os: session.os || 'Unknown OS',
      ipAddress: session.ipAddress,
      location: session.location,
      createdAt: session.createdAt,
      lastActiveAt: session.lastActiveAt,
      isCurrent: session.id === current.id,
    }));
  }

  async revoke(userId: string, sessionId: string): Promise<{ revoked: true }> {
    const session = await this.prisma.userLoginSession.findFirst({
      where: { id: sessionId, userId, revokedAt: null },
    });
    if (!session) throw new NotFoundException('Login session not found.');

    await this.revokeRows(
      userId,
      [session],
      'signed out from login management',
    );
    return { revoked: true };
  }

  async revokeCurrent(
    userId: string,
    current: CurrentLoginSession,
  ): Promise<{ revoked: true }> {
    const session = await this.prisma.userLoginSession.findFirst({
      where: { id: current.id, userId, revokedAt: null },
    });

    // Keep logout idempotent. A concurrent revoke should never prevent the
    // browser from clearing its local credentials.
    if (!session) return { revoked: true };

    await this.revokeRows(userId, [session], 'signed out on current device');
    return { revoked: true };
  }

  async revokeOthers(
    userId: string,
    current: CurrentLoginSession,
  ): Promise<{ revoked: number }> {
    await this.reconcileProviderSessions(userId, current);
    const sessions = await this.prisma.userLoginSession.findMany({
      where: {
        userId,
        revokedAt: null,
        id: { not: current.id },
      },
    });
    if (sessions.length === 0) return { revoked: 0 };

    const revoked = await this.revokeRows(
      userId,
      sessions,
      'signed out from another device',
    );
    return { revoked };
  }

  private async revokeRows(
    userId: string,
    sessions: UserLoginSession[],
    reason: string,
  ): Promise<number> {
    const ids = sessions.map((session) => session.id);
    const providerIds = sessions
      .map((session) => session.providerSessionId)
      .filter((id): id is string => Boolean(id));
    const revokedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      const result = await tx.userLoginSession.updateMany({
        where: { id: { in: ids }, userId, revokedAt: null },
        data: { revokedAt, revokeReason: reason },
      });

      if (providerIds.length > 0) {
        // Supabase documents JWT session_id as auth.sessions.id. Removing that
        // row revokes the corresponding refresh token (the FK cascades) while
        // the ClearWork denylist above blocks the still-unexpired access JWT.
        await tx.$executeRaw(
          Prisma.sql`
            DELETE FROM auth.sessions
            WHERE user_id::text = ${userId}
              AND id::text IN (${Prisma.join(providerIds)})
          `,
        );
      }

      return result.count;
    });
  }

  /**
   * Supabase's auth.sessions table is authoritative for refresh sessions. A
   * device that has not called the ClearWork API since this feature shipped is
   * backfilled here, while sessions ended by another Supabase client are
   * removed from the active list immediately.
   */
  private async reconcileProviderSessions(
    userId: string,
    current: CurrentLoginSession,
  ): Promise<void> {
    const providerSessions = await this.prisma.$queryRaw<ProviderSessionRow[]>(
      Prisma.sql`
        SELECT
          id::text AS "id",
          created_at AS "createdAt",
          refreshed_at AS "refreshedAt",
          user_agent AS "userAgent",
          ip::text AS "ipAddress"
        FROM auth.sessions
        WHERE user_id::text = ${userId}
      `,
    );
    const providerIds = new Set(providerSessions.map((session) => session.id));
    const tracked = await this.prisma.userLoginSession.findMany({
      where: { userId, revokedAt: null },
    });
    const trackedProviderIds = new Set(
      tracked
        .map((session) => session.providerSessionId)
        .filter((id): id is string => Boolean(id)),
    );

    for (const provider of providerSessions) {
      if (trackedProviderIds.has(provider.id)) continue;
      const detected = this.detectUserAgent(provider.userAgent ?? '');
      const identity = this.identityFromPayload({
        sub: userId,
        session_id: provider.id,
      });
      try {
        await this.prisma.userLoginSession.create({
          data: {
            userId,
            providerSessionId: provider.id,
            sessionFingerprint: identity.sessionFingerprint,
            deviceName: detected.deviceName,
            deviceType: detected.deviceType,
            browser: detected.browser,
            os: detected.os,
            ipAddress: this.clean(provider.ipAddress ?? undefined, 120),
            userAgent: this.clean(provider.userAgent ?? undefined, 500),
            createdAt: provider.createdAt,
            lastActiveAt: provider.refreshedAt ?? provider.createdAt,
          },
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        ) {
          throw error;
        }
      }
    }

    const staleIds = tracked
      .filter(
        (session) =>
          session.providerSessionId &&
          !providerIds.has(session.providerSessionId),
      )
      .map((session) => session.id);

    if (staleIds.length > 0) {
      await this.prisma.userLoginSession.updateMany({
        where: { id: { in: staleIds }, userId, revokedAt: null },
        data: {
          revokedAt: new Date(),
          revokeReason: 'Supabase session ended',
        },
      });
      if (staleIds.includes(current.id)) this.throwRevoked();
    }
  }

  private async findByIdentity(
    identity: SessionIdentity,
  ): Promise<UserLoginSession | null> {
    if (identity.providerSessionId) {
      return this.prisma.userLoginSession.findUnique({
        where: { providerSessionId: identity.providerSessionId },
      });
    }
    return this.prisma.userLoginSession.findUnique({
      where: { sessionFingerprint: identity.sessionFingerprint },
    });
  }

  private identityFromPayload(
    payload: LoginSessionJwtPayload,
  ): SessionIdentity {
    const providerSessionId = this.clean(payload.session_id, 160);
    const stablePart =
      providerSessionId ||
      this.clean(payload.jti, 200) ||
      `issued:${payload.iat ?? 'unknown'}`;
    const sessionFingerprint = createHash('sha256')
      .update(`${payload.sub}\u0000${stablePart}`)
      .digest('hex');
    return { providerSessionId, sessionFingerprint };
  }

  private deviceMetadata(request: Request): DeviceMetadata {
    const userAgent = this.clean(this.header(request, 'user-agent'), 500);
    const detected = this.detectUserAgent(userAgent ?? '');
    const requestedName = this.clean(
      this.header(request, 'x-device-name'),
      100,
    );
    const requestedType = this.normalizeDeviceType(
      this.header(request, 'x-device-type') ?? detected.deviceType,
    );
    const timezone = this.clean(this.header(request, 'x-device-timezone'), 100);

    return {
      deviceId: this.clean(this.header(request, 'x-device-id'), 100),
      deviceName: requestedName || detected.deviceName,
      deviceType: requestedType,
      browser: detected.browser,
      os: detected.os,
      ipAddress: this.requestIp(request),
      location: this.requestLocation(request, timezone),
      userAgent,
    };
  }

  private detectUserAgent(userAgent: string): {
    browser: string;
    os: string;
    deviceName: string;
    deviceType: LoginDeviceType;
  } {
    const browser = this.browserName(userAgent);
    const os = this.osName(userAgent);
    let deviceType: LoginDeviceType = 'desktop';
    let deviceName = `${browser} on ${os}`;

    if (
      /iPad/i.test(userAgent) ||
      (/Macintosh/i.test(userAgent) && /Mobile/i.test(userAgent))
    ) {
      deviceType = 'tablet';
      deviceName = 'iPad';
    } else if (/iPhone|iPod/i.test(userAgent)) {
      deviceType = 'mobile';
      deviceName = 'iPhone';
    } else if (/Android/i.test(userAgent)) {
      deviceType = /Mobile/i.test(userAgent) ? 'mobile' : 'tablet';
      deviceName = deviceType === 'mobile' ? 'Android phone' : 'Android tablet';
    } else if (/Tablet/i.test(userAgent)) {
      deviceType = 'tablet';
      deviceName = 'Tablet';
    } else if (!userAgent) {
      deviceType = 'unknown';
      deviceName = 'Unknown device';
    }

    return { browser, os, deviceName, deviceType };
  }

  private browserName(userAgent: string): string {
    const candidates: Array<[RegExp, string]> = [
      [/EdgA?\/(\d+)/i, 'Microsoft Edge'],
      [/OPR\/(\d+)/i, 'Opera'],
      [/SamsungBrowser\/(\d+)/i, 'Samsung Internet'],
      [/(?:Chrome|CriOS)\/(\d+)/i, 'Chrome'],
      [/(?:Firefox|FxiOS)\/(\d+)/i, 'Firefox'],
      [/Version\/(\d+).+Safari/i, 'Safari'],
    ];
    for (const [pattern, name] of candidates) {
      const match = pattern.exec(userAgent);
      if (match) return `${name} ${match[1]}`;
    }
    return userAgent ? 'Unknown browser' : 'Unknown browser';
  }

  private osName(userAgent: string): string {
    let match = /Windows NT ([\d.]+)/i.exec(userAgent);
    if (match) return 'Windows';
    match = /Android ([\d.]+)/i.exec(userAgent);
    if (match) return `Android ${match[1]}`;
    match = /(?:iPhone OS|CPU OS) ([\d_]+)/i.exec(userAgent);
    if (match) return `iOS ${match[1].replace(/_/g, '.')}`;
    match = /Mac OS X ([\d_]+)/i.exec(userAgent);
    if (match) return `macOS ${match[1].replace(/_/g, '.')}`;
    if (/CrOS/i.test(userAgent)) return 'ChromeOS';
    if (/Linux/i.test(userAgent)) return 'Linux';
    return 'Unknown OS';
  }

  private requestIp(request: Request): string | null {
    const forwarded = this.header(request, 'x-forwarded-for')
      ?.split(',')[0]
      ?.trim();
    const value =
      this.header(request, 'cf-connecting-ip') ||
      this.header(request, 'x-real-ip') ||
      forwarded ||
      request.ip ||
      request.socket?.remoteAddress;
    return this.clean(value?.replace(/^::ffff:/, ''), 120);
  }

  private requestLocation(
    request: Request,
    timezone: string | null,
  ): string | null {
    const city = this.decodeHeader(this.header(request, 'x-vercel-ip-city'));
    const region = this.decodeHeader(
      this.header(request, 'x-vercel-ip-country-region'),
    );
    const country = this.clean(
      this.header(request, 'x-vercel-ip-country') ||
        this.header(request, 'cf-ipcountry'),
      80,
    );
    const location = [city, region, country]
      .filter(
        (value, index, values): value is string =>
          Boolean(value) && values.indexOf(value) === index,
      )
      .join(', ');
    if (location) return location.slice(0, 200);

    if (!timezone || timezone === 'Unknown') return null;
    return timezone
      .replace(/_/g, ' ')
      .split('/')
      .reverse()
      .join(', ')
      .slice(0, 200);
  }

  private decodeHeader(value: string | undefined): string | null {
    const cleanValue = this.clean(value, 120);
    if (!cleanValue) return null;
    try {
      return this.clean(decodeURIComponent(cleanValue), 120);
    } catch {
      return cleanValue;
    }
  }

  private header(request: Request, name: string): string | undefined {
    const value = request.headers[name];
    return Array.isArray(value) ? value[0] : value;
  }

  private clean(value: string | undefined, maxLength: number): string | null {
    if (!value) return null;
    const cleaned = Array.from(value)
      .filter((character) => {
        const code = character.charCodeAt(0);
        return code >= 32 && code !== 127;
      })
      .join('')
      .trim()
      .slice(0, maxLength);
    return cleaned || null;
  }

  private normalizeDeviceType(value: string): LoginDeviceType {
    return value === 'desktop' || value === 'mobile' || value === 'tablet'
      ? value
      : 'unknown';
  }

  private tokenExpiry(exp: number | undefined): Date | null {
    return typeof exp === 'number' && Number.isFinite(exp)
      ? new Date(exp * 1000)
      : null;
  }

  private toCurrentSession(session: UserLoginSession): CurrentLoginSession {
    return {
      id: session.id,
      providerSessionId: session.providerSessionId,
      sessionFingerprint: session.sessionFingerprint,
    };
  }

  private throwRevoked(): never {
    throw new UnauthorizedException({
      message: 'This login session has been signed out.',
      code: 'SESSION_REVOKED',
    });
  }
}

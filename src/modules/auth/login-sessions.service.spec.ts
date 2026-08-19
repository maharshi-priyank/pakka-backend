import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { UserLoginSession } from '@prisma/client';
import type { Request } from 'express';
import {
  LoginSessionsService,
  type LoginSessionRequest,
} from './login-sessions.service';
import type { PrismaService } from '../../prisma/prisma.service';

function session(overrides: Partial<UserLoginSession> = {}): UserLoginSession {
  const now = new Date('2026-08-19T10:00:00.000Z');
  return {
    id: 'session-row-1',
    userId: 'user-1',
    providerSessionId: 'provider-session-1',
    sessionFingerprint: 'fingerprint-1',
    deviceId: 'device-1',
    deviceName: 'Mac',
    deviceType: 'desktop',
    browser: 'Chrome 140',
    os: 'macOS 15.0',
    ipAddress: '203.0.113.10',
    location: 'Kolkata, India',
    userAgent: 'Mozilla/5.0 Chrome/140.0.0.0',
    createdAt: now,
    lastActiveAt: now,
    tokenExpiresAt: new Date('2026-08-19T11:00:00.000Z'),
    revokedAt: null,
    revokeReason: null,
    ...overrides,
  };
}

function request(): LoginSessionRequest {
  return {
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) Chrome/140.0.0.0',
      'x-device-id': '3ec0f3d2-8a39-48d5-88ab-3921513f09dd',
      'x-device-name': 'Mac',
      'x-device-type': 'desktop',
      'x-device-timezone': 'Asia/Kolkata',
      'x-forwarded-for': '203.0.113.10, 10.0.0.1',
    },
    ip: '10.0.0.1',
    socket: { remoteAddress: '10.0.0.1' },
  } as unknown as Request;
}

function firstMockArgument(mock: jest.Mock): unknown {
  const calls = mock.mock.calls as unknown[][];
  return calls[0]?.[0];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected a record-shaped mock argument.');
  }
  return value as Record<string, unknown>;
}

function sqlValues(mock: jest.Mock): unknown[] {
  const values = asRecord(firstMockArgument(mock)).values;
  if (!Array.isArray(values))
    throw new Error('Expected a parameterized SQL query.');
  return values as unknown[];
}

describe('LoginSessionsService', () => {
  let service: LoginSessionsService;
  let prisma: {
    userLoginSession: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      userLoginSession: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (callback: (tx: typeof prisma) => Promise<unknown>) =>
        callback(prisma),
    );
    service = new LoginSessionsService(prisma as unknown as PrismaService);
  });

  it('registers a Supabase session without persisting bearer tokens', async () => {
    prisma.userLoginSession.findUnique.mockResolvedValue(null);
    prisma.userLoginSession.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(
          session({
            providerSessionId: data.providerSessionId as string,
            sessionFingerprint: data.sessionFingerprint as string,
            lastActiveAt: new Date(),
          }),
        ),
    );
    const req = request();

    const current = await service.observe(
      'user-1',
      {
        sub: 'user-1',
        session_id: 'provider-session-1',
        exp: 1_787_136_000,
      },
      req,
    );

    const createData = asRecord(
      asRecord(firstMockArgument(prisma.userLoginSession.create)).data,
    );
    expect(createData).toMatchObject({
      userId: 'user-1',
      providerSessionId: 'provider-session-1',
      deviceName: 'Mac',
      deviceType: 'desktop',
      ipAddress: '203.0.113.10',
      location: 'Kolkata, Asia',
    });
    expect(createData.sessionFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(createData).not.toHaveProperty('accessToken');
    expect(createData).not.toHaveProperty('refreshToken');
    expect(req.loginSession).toEqual(current);
  });

  it('rejects a previously revoked session on payload-only routes', async () => {
    prisma.userLoginSession.findUnique.mockResolvedValue(
      session({ revokedAt: new Date() }),
    );

    await expect(
      service.assertNotRevoked({
        sub: 'user-1',
        session_id: 'provider-session-1',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    try {
      await service.assertNotRevoked({
        sub: 'user-1',
        session_id: 'provider-session-1',
      });
    } catch (error) {
      expect((error as UnauthorizedException).getResponse()).toMatchObject({
        code: 'SESSION_REVOKED',
      });
    }
  });

  it('does not write last-active metadata on every request', async () => {
    prisma.userLoginSession.findUnique.mockResolvedValue(
      session({ lastActiveAt: new Date() }),
    );

    await service.observe(
      'user-1',
      { sub: 'user-1', session_id: 'provider-session-1' },
      request(),
    );

    expect(prisma.userLoginSession.update).not.toHaveBeenCalled();
  });

  it('marks the JWT-backed row as the current device in listings', async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'provider-session-1',
        createdAt: new Date(),
        refreshedAt: new Date(),
        userAgent: 'Chrome/140.0.0.0',
        ipAddress: '203.0.113.10',
      },
      {
        id: 'provider-session-2',
        createdAt: new Date(),
        refreshedAt: new Date(),
        userAgent: 'Mobile Safari',
        ipAddress: '203.0.113.11',
      },
    ]);
    prisma.userLoginSession.findMany.mockResolvedValue([
      session(),
      session({
        id: 'session-row-2',
        providerSessionId: 'provider-session-2',
        sessionFingerprint: 'fingerprint-2',
        deviceName: 'iPhone',
        deviceType: 'mobile',
      }),
    ]);

    const result = await service.list('user-1', {
      id: 'session-row-1',
      providerSessionId: 'provider-session-1',
      sessionFingerprint: 'fingerprint-1',
    });

    expect(result.map(({ id, isCurrent }) => ({ id, isCurrent }))).toEqual([
      { id: 'session-row-1', isCurrent: true },
      { id: 'session-row-2', isCurrent: false },
    ]);
  });

  it('backfills existing Supabase sessions that predate device tracking', async () => {
    const providerCreatedAt = new Date('2026-08-18T10:00:00.000Z');
    const providerRefreshedAt = new Date('2026-08-19T09:00:00.000Z');
    const backfilled = session({
      id: 'backfilled-row',
      providerSessionId: 'existing-provider-session',
      sessionFingerprint: 'backfilled-fingerprint',
      createdAt: providerCreatedAt,
      lastActiveAt: providerRefreshedAt,
    });
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'existing-provider-session',
        createdAt: providerCreatedAt,
        refreshedAt: providerRefreshedAt,
        userAgent: 'Mozilla/5.0 Chrome/140.0.0.0',
        ipAddress: '203.0.113.20',
      },
    ]);
    prisma.userLoginSession.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([backfilled]);
    prisma.userLoginSession.create.mockResolvedValue(backfilled);

    const result = await service.list('user-1', {
      id: 'backfilled-row',
      providerSessionId: 'existing-provider-session',
      sessionFingerprint: 'backfilled-fingerprint',
    });

    const backfillData = asRecord(
      asRecord(firstMockArgument(prisma.userLoginSession.create)).data,
    );
    expect(backfillData).toMatchObject({
      userId: 'user-1',
      providerSessionId: 'existing-provider-session',
      createdAt: providerCreatedAt,
      lastActiveAt: providerRefreshedAt,
    });
    expect(result[0]).toMatchObject({
      id: 'backfilled-row',
      isCurrent: true,
    });
  });

  it('rejects the current JWT when its authoritative Supabase session is gone', async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.userLoginSession.findMany.mockResolvedValue([session()]);
    prisma.userLoginSession.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.list('user-1', {
        id: 'session-row-1',
        providerSessionId: 'provider-session-1',
        sessionFingerprint: 'fingerprint-1',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const staleUpdateData = asRecord(
      asRecord(firstMockArgument(prisma.userLoginSession.updateMany)).data,
    );
    expect(staleUpdateData).toMatchObject({
      revokeReason: 'Supabase session ended',
    });
  });

  it('scopes individual revocation to the authenticated user and provider session', async () => {
    prisma.userLoginSession.findFirst.mockResolvedValue(session());
    prisma.userLoginSession.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.revoke('user-1', 'session-row-1')).resolves.toEqual({
      revoked: true,
    });

    expect(prisma.userLoginSession.findFirst).toHaveBeenCalledWith({
      where: { id: 'session-row-1', userId: 'user-1', revokedAt: null },
    });
    const revokeWhere = asRecord(
      asRecord(firstMockArgument(prisma.userLoginSession.updateMany)).where,
    );
    expect(revokeWhere).toMatchObject({ userId: 'user-1', revokedAt: null });
    expect(sqlValues(prisma.$executeRaw)).toEqual(
      expect.arrayContaining(['user-1', 'provider-session-1']),
    );
  });

  it("does not reveal or revoke another user's session identifier", async () => {
    prisma.userLoginSession.findFirst.mockResolvedValue(null);

    await expect(
      service.revoke('user-1', 'another-users-session'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('keeps the current session while revoking every other device', async () => {
    const otherSession = session({
      id: 'session-row-2',
      providerSessionId: 'provider-session-2',
      sessionFingerprint: 'fingerprint-2',
    });
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'provider-session-1',
        createdAt: new Date(),
        refreshedAt: new Date(),
        userAgent: 'Chrome/140.0.0.0',
        ipAddress: '203.0.113.10',
      },
      {
        id: 'provider-session-2',
        createdAt: new Date(),
        refreshedAt: new Date(),
        userAgent: 'Mobile Safari',
        ipAddress: '203.0.113.11',
      },
    ]);
    prisma.userLoginSession.findMany
      .mockResolvedValueOnce([session(), otherSession])
      .mockResolvedValueOnce([otherSession]);
    prisma.userLoginSession.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.revokeOthers('user-1', {
        id: 'session-row-1',
        providerSessionId: 'provider-session-1',
        sessionFingerprint: 'fingerprint-1',
      }),
    ).resolves.toEqual({ revoked: 1 });

    expect(prisma.userLoginSession.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        revokedAt: null,
        id: { not: 'session-row-1' },
      },
    });
    expect(sqlValues(prisma.$executeRaw)).not.toContain('provider-session-1');
    expect(sqlValues(prisma.$executeRaw)).toContain('provider-session-2');
  });
});

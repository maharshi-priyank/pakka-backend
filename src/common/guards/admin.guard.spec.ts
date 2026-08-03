import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { AdminRole } from '@prisma/client';
import { AdminGuard } from './admin.guard';

describe('AdminGuard tier logic', () => {
  let guard: AdminGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  const ctx = (admin: unknown, tier: string | undefined) => {
    reflector.getAllAndOverride.mockReturnValue(tier);
    return {
      switchToHttp: () => ({ getRequest: () => ({ user: admin }) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new AdminGuard(reflector as unknown as Reflector);
    jest
      .spyOn(Object.getPrototypeOf(AdminGuard.prototype), 'canActivate')
      .mockResolvedValue(true as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it('admits a superadmin to a superadmin-only route', async () => {
    const ok = await guard.canActivate(ctx({ id: 'a', role: AdminRole.SUPERADMIN }, 'superadmin'));
    expect(ok).toBe(true);
  });

  it('admits a superadmin to a support route (hierarchical)', async () => {
    const ok = await guard.canActivate(ctx({ id: 'a', role: AdminRole.SUPERADMIN }, 'support'));
    expect(ok).toBe(true);
  });

  it('admits support to a support route', async () => {
    const ok = await guard.canActivate(ctx({ id: 'a', role: AdminRole.SUPPORT }, 'support'));
    expect(ok).toBe(true);
  });

  it('denies support a superadmin-only route', async () => {
    await expect(guard.canActivate(ctx({ id: 'a', role: AdminRole.SUPPORT }, 'superadmin'))).rejects.toBeDefined();
  });

  it('denies an unauthenticated request (no admin on request.user)', async () => {
    await expect(guard.canActivate(ctx(undefined, 'support'))).rejects.toBeDefined();
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AdminRole } from '@prisma/client';
import { AdminImpersonationService } from './admin-impersonation.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConsumedJtiStore } from './consumed-jti.store';

const admin = { id: 'admin-1', role: AdminRole.SUPERADMIN } as never;

describe('AdminImpersonationService', () => {
  let service: AdminImpersonationService;
  let prisma: { user: { findUnique: jest.Mock } };
  let jwt: { signAsync: jest.Mock; decode: jest.Mock; verifyAsync: jest.Mock };
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1', email: 't@e.com' }) } };
    jwt = { signAsync: jest.fn().mockResolvedValue('imp.token'), decode: jest.fn(), verifyAsync: jest.fn() };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminImpersonationService,
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: { getOrThrow: () => 'imp-secret', get: () => '15m' } },
        { provide: AuditService, useValue: audit },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AdminImpersonationService);
  });

  it('AE5: mints a token with sub=tenantUser, imp=adminId, jti and audits start', async () => {
    const res = await service.mintForUser(admin, 'u1');
    expect(res.token).toBe('imp.token');
    expect(res.expiresAt).toBeGreaterThan(Date.now());
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'u1', imp: 'admin-1' }),
      expect.objectContaining({ secret: 'imp-secret' }),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      adminId: 'admin-1', action: 'admin.impersonate.start', targetId: 'u1',
    }));
  });

  it('throws on unknown tenant user', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.mintForUser(admin, 'nope')).rejects.toThrow(NotFoundException);
  });
});

describe('ConsumedJtiStore', () => {
  let store: ConsumedJtiStore;
  beforeEach(() => { store = new ConsumedJtiStore(); });

  it('consumes a jti once and rejects replay', () => {
    expect(store.consume('jti-1')).toBe(true);
    expect(store.consume('jti-1')).toBe(false);
    expect(store.has('jti-1')).toBe(true);
  });

  it('accepts distinct jtis', () => {
    expect(store.consume('a')).toBe(true);
    expect(store.consume('b')).toBe(true);
  });
});

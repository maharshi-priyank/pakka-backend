import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AdminAuthService } from './admin-auth.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AdminRole } from '@prisma/client';

jest.mock('bcrypt');

describe('AdminAuthService', () => {
  let service: AdminAuthService;
  let prisma: { adminUser: { findUnique: jest.Mock; update: jest.Mock } };
  let jwt: { signAsync: jest.Mock };
  let audit: { log: jest.Mock };

  const admin = {
    id: 'admin-1',
    email: 'admin@example.com',
    passwordHash: 'hashed',
    role: AdminRole.SUPERADMIN,
  };

  beforeEach(async () => {
    prisma = {
      adminUser: {
        findUnique: jest.fn().mockResolvedValue(admin),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    jwt = { signAsync: jest.fn().mockResolvedValue('admin.jwt.token') };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuthService,
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: { getOrThrow: () => 'secret', get: () => '8h' } },
        { provide: AuditService, useValue: audit },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AdminAuthService);
  });

  it('returns a token and audits login on valid credentials', async () => {
    const res = await service.login('Admin@Example.com', 'password123');
    expect(res.token).toBe('admin.jwt.token');
    expect(prisma.adminUser.findUnique).toHaveBeenCalledWith({ where: { email: 'admin@example.com' } });
    expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashed');
    expect(prisma.adminUser.update).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'admin.login', adminId: 'admin-1' }));
  });

  it('throws on unknown admin', async () => {
    prisma.adminUser.findUnique.mockResolvedValue(null);
    await expect(service.login('x@example.com', 'p')).rejects.toThrow(UnauthorizedException);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('throws on wrong password and does not audit', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    await expect(service.login('admin@example.com', 'wrong')).rejects.toThrow(UnauthorizedException);
    expect(audit.log).not.toHaveBeenCalled();
  });
});

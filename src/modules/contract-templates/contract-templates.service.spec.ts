import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ContractTemplatesService } from './contract-templates.service';
import { PrismaService } from '../../prisma/prisma.service';

// U2/KTD1/KTD2/KTD4/KTD10: full CRUD + save-from-contract + set-default +
// seed for ContractTemplate, mirroring proposal-templates.service.ts but
// fixing its workspace-scoping bug (every call here is keyed by the
// resolved workspaceId, never a raw user id) and adding mutable per-workspace
// default-template state that proposal-templates' virtual SYSTEM_TEMPLATES
// constant never needed.
describe('ContractTemplatesService', () => {
  let service: ContractTemplatesService;
  let prisma: {
    contractTemplate: {
      findMany:    jest.Mock;
      findFirst:   jest.Mock;
      findUnique:  jest.Mock;
      create:      jest.Mock;
      update:      jest.Mock;
      updateMany:  jest.Mock;
      upsert:      jest.Mock;
      delete:      jest.Mock;
    };
    contract: {
      findFirst: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      contractTemplate: {
        findMany:   jest.fn(),
        findFirst:  jest.fn(),
        findUnique: jest.fn(),
        create:     jest.fn(),
        update:     jest.fn(),
        updateMany: jest.fn(),
        upsert:     jest.fn(),
        delete:     jest.fn(),
      },
      contract: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractTemplatesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<ContractTemplatesService>(ContractTemplatesService);
  });

  const makeTemplate = (overrides: Record<string, unknown> = {}) => ({
    id:          'tpl-1',
    workspaceId: 'ws-1',
    key:         null,
    name:        'My Contract Template',
    description: null,
    category:    null,
    content:     { clauses: [] },
    totalAmount: 0,
    usageCount:  0,
    isDefault:   false,
    isSystem:    false,
    createdAt:   new Date(),
    updatedAt:   new Date(),
    ...overrides,
  });

  describe('create()', () => {
    it('persists a new template scoped to the caller\'s workspace', async () => {
      prisma.contractTemplate.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(makeTemplate(data)));

      const result = await service.create('ws-1', {
        name:    'Retainer Contract',
        content: { clauses: [{ title: 'Payment Terms', body: 'Custom body' }] },
      } as any);

      expect(prisma.contractTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: 'ws-1',
          name:        'Retainer Contract',
          content:     { clauses: [{ title: 'Payment Terms', body: 'Custom body' }] },
        }),
      });
      expect(result.workspaceId).toBe('ws-1');
      expect(result.name).toBe('Retainer Contract');
      expect(result.totalAmount).toBe(0);
    });
  });

  describe('setDefault()', () => {
    it('unsets the previous default and sets the new one, verified via two sequential calls', async () => {
      const rows: Record<string, any> = {
        'tpl-a': makeTemplate({ id: 'tpl-a', isDefault: true }),
        'tpl-b': makeTemplate({ id: 'tpl-b', isDefault: false }),
      };
      prisma.contractTemplate.findFirst.mockImplementation(({ where }: any) => {
        const row = rows[where.id];
        if (!row || row.workspaceId !== where.workspaceId) return Promise.resolve(null);
        if (where.isDefault !== undefined && row.isDefault !== where.isDefault) return Promise.resolve(null);
        return Promise.resolve(row);
      });
      prisma.contractTemplate.updateMany.mockImplementation(({ where, data }: any) => {
        Object.values(rows).forEach((row) => {
          if (row.workspaceId === where.workspaceId && row.isDefault === where.isDefault) Object.assign(row, data);
        });
        return Promise.resolve({ count: 1 });
      });
      prisma.contractTemplate.update.mockImplementation(({ where, data }: any) => {
        Object.assign(rows[where.id], data);
        return Promise.resolve(rows[where.id]);
      });

      // First call: tpl-a is already default -- setting it default again is a no-op transition.
      await service.setDefault('ws-1', 'tpl-a');
      expect(rows['tpl-a'].isDefault).toBe(true);

      // Second call: setting tpl-b as default must unset tpl-a.
      await service.setDefault('ws-1', 'tpl-b');

      expect(prisma.contractTemplate.updateMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1', isDefault: true },
        data:  { isDefault: false },
      });
      expect(prisma.contractTemplate.update).toHaveBeenCalledWith({
        where: { id: 'tpl-b' },
        data:  { isDefault: true },
      });
      expect(rows['tpl-a'].isDefault).toBe(false);
      expect(rows['tpl-b'].isDefault).toBe(true);
    });

    it('covers AE3: setting Template B as default un-defaults Template A', async () => {
      const rows: Record<string, any> = {
        'tpl-a': makeTemplate({ id: 'tpl-a', isDefault: true }),
        'tpl-b': makeTemplate({ id: 'tpl-b', isDefault: false }),
      };
      prisma.contractTemplate.findFirst.mockImplementation(({ where }: any) => Promise.resolve(rows[where.id] ?? null));
      prisma.contractTemplate.updateMany.mockImplementation(({ where, data }: any) => {
        Object.values(rows).forEach((row) => {
          if (row.workspaceId === where.workspaceId && row.isDefault === where.isDefault) Object.assign(row, data);
        });
        return Promise.resolve({ count: 1 });
      });
      prisma.contractTemplate.update.mockImplementation(({ where, data }: any) => {
        Object.assign(rows[where.id], data);
        return Promise.resolve(rows[where.id]);
      });

      await service.setDefault('ws-1', 'tpl-b');

      expect(rows['tpl-a'].isDefault).toBe(false);
      expect(rows['tpl-b'].isDefault).toBe(true);
    });

    it('rejects setting a template as default when it is not in the caller\'s workspace', async () => {
      prisma.contractTemplate.findFirst.mockResolvedValue(null);

      await expect(service.setDefault('ws-1', 'tpl-other-ws')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('getDefault()', () => {
    it('returns null for a workspace with no default (pre-seed state)', async () => {
      prisma.contractTemplate.findFirst.mockResolvedValue(null);

      const result = await service.getDefault('ws-1');

      expect(prisma.contractTemplate.findFirst).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1', isDefault: true },
      });
      expect(result).toBeNull();
    });

    it('returns the serialized default template when one exists', async () => {
      prisma.contractTemplate.findFirst.mockResolvedValue(makeTemplate({ isDefault: true, totalAmount: 0 }));

      const result = await service.getDefault('ws-1');

      expect(result?.isDefault).toBe(true);
      expect(result?.totalAmount).toBe(0);
    });
  });

  describe('seedDefault()', () => {
    it('is a no-op the second time it is called for the same workspace (idempotency)', async () => {
      prisma.contractTemplate.upsert.mockResolvedValue(makeTemplate({ key: 'system-default', isSystem: true, isDefault: true }));

      await service.seedDefault('ws-1');
      await service.seedDefault('ws-1');

      expect(prisma.contractTemplate.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.contractTemplate.upsert).toHaveBeenNthCalledWith(1, {
        where:  { workspaceId_key: { workspaceId: 'ws-1', key: 'system-default' } },
        update: {},
        create: expect.objectContaining({
          workspaceId: 'ws-1',
          key:         'system-default',
          isSystem:    true,
          isDefault:   true,
          name:        'Standard Contract',
        }),
      });
      // update is always {} -- the second call cannot mutate an existing row.
      expect(prisma.contractTemplate.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({ update: {} }));
    });
  });

  describe('remove()', () => {
    it('rejects deleting the seeded system template, even when it is not currently the default', async () => {
      prisma.contractTemplate.findUnique.mockResolvedValue(
        makeTemplate({ isSystem: true, isDefault: false }),
      );

      await expect(service.remove('ws-1', 'tpl-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.contractTemplate.delete).not.toHaveBeenCalled();
    });

    it('rejects deleting the current default template even when it is not a system template', async () => {
      prisma.contractTemplate.findUnique.mockResolvedValue(
        makeTemplate({ isSystem: false, isDefault: true }),
      );

      await expect(service.remove('ws-1', 'tpl-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.contractTemplate.delete).not.toHaveBeenCalled();
    });

    it('deletes a non-system, non-default template belonging to the caller\'s workspace', async () => {
      prisma.contractTemplate.findUnique.mockResolvedValue(
        makeTemplate({ isSystem: false, isDefault: false }),
      );
      prisma.contractTemplate.delete.mockResolvedValue({});

      const result = await service.remove('ws-1', 'tpl-1');

      expect(prisma.contractTemplate.delete).toHaveBeenCalledWith({ where: { id: 'tpl-1' } });
      expect(result).toEqual({ success: true });
    });
  });

  describe('update()/remove() workspace-scoping (KTD1 regression check)', () => {
    it('rejects update() on a template belonging to a different workspace', async () => {
      prisma.contractTemplate.findUnique.mockResolvedValue(makeTemplate({ workspaceId: 'ws-other' }));

      await expect(service.update('ws-1', 'tpl-1', { name: 'New name' } as any))
        .rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.contractTemplate.update).not.toHaveBeenCalled();
    });

    it('rejects remove() on a template belonging to a different workspace', async () => {
      prisma.contractTemplate.findUnique.mockResolvedValue(makeTemplate({ workspaceId: 'ws-other' }));

      await expect(service.remove('ws-1', 'tpl-1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.contractTemplate.delete).not.toHaveBeenCalled();
    });

    it('rejects update() with a NotFoundException when the template does not exist at all', async () => {
      prisma.contractTemplate.findUnique.mockResolvedValue(null);

      await expect(service.update('ws-1', 'missing', { name: 'x' } as any))
        .rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

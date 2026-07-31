import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InvoiceTemplatesService } from './invoice-templates.service';
import { PrismaService } from '../../prisma/prisma.service';

// U3/KTD1/KTD2/KTD4/KTD6/KTD10: full CRUD + save-from-invoice + set-default +
// seed for InvoiceTemplate, mirroring proposal-templates.service.ts (and
// contract-templates.service.ts's U2 shape) but fixing proposal-templates'
// workspace-scoping bug (every call here is keyed by the resolved
// workspaceId, never a raw user id) and adding mutable per-workspace
// default-template state that proposal-templates' virtual SYSTEM_TEMPLATES
// constant never needed.
describe('InvoiceTemplatesService', () => {
  let service: InvoiceTemplatesService;
  let prisma: {
    invoiceTemplate: {
      findMany:    jest.Mock;
      findFirst:   jest.Mock;
      findUnique:  jest.Mock;
      create:      jest.Mock;
      update:      jest.Mock;
      updateMany:  jest.Mock;
      upsert:      jest.Mock;
      delete:      jest.Mock;
    };
    invoice: {
      findFirst: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      invoiceTemplate: {
        findMany:   jest.fn(),
        findFirst:  jest.fn(),
        findUnique: jest.fn(),
        create:     jest.fn(),
        update:     jest.fn(),
        updateMany: jest.fn(),
        upsert:     jest.fn(),
        delete:     jest.fn(),
      },
      invoice: {
        findFirst: jest.fn(),
      },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceTemplatesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<InvoiceTemplatesService>(InvoiceTemplatesService);
  });

  const makeTemplate = (overrides: Record<string, unknown> = {}) => ({
    id:          'tpl-1',
    workspaceId: 'ws-1',
    key:         null,
    name:        'My Invoice Template',
    description: null,
    category:    null,
    content:     { notes: '' },
    totalAmount: 0,
    usageCount:  0,
    isDefault:   false,
    isSystem:    false,
    createdAt:   new Date(),
    updatedAt:   new Date(),
    ...overrides,
  });

  describe('create()', () => {
    it('persists a new Invoice template scoped to the caller\'s workspace', async () => {
      prisma.invoiceTemplate.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(makeTemplate(data)));

      const result = await service.create('ws-1', {
        name:    'Net-30 Invoice',
        content: { notes: 'Custom notes' },
      } as any);

      expect(prisma.invoiceTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId: 'ws-1',
          name:        'Net-30 Invoice',
          content:     { notes: 'Custom notes' },
        }),
      });
      expect(result.workspaceId).toBe('ws-1');
      expect(result.name).toBe('Net-30 Invoice');
      expect(result.totalAmount).toBe(0);
    });
  });

  describe('setDefault()', () => {
    it('unsets the previous default Invoice template and sets the new one', async () => {
      const rows: Record<string, any> = {
        'tpl-a': makeTemplate({ id: 'tpl-a', isDefault: true }),
        'tpl-b': makeTemplate({ id: 'tpl-b', isDefault: false }),
      };
      prisma.invoiceTemplate.findFirst.mockImplementation(({ where }: any) => {
        const row = rows[where.id];
        if (!row || row.workspaceId !== where.workspaceId) return Promise.resolve(null);
        if (where.isDefault !== undefined && row.isDefault !== where.isDefault) return Promise.resolve(null);
        return Promise.resolve(row);
      });
      prisma.invoiceTemplate.updateMany.mockImplementation(({ where, data }: any) => {
        Object.values(rows).forEach((row) => {
          if (row.workspaceId === where.workspaceId && row.isDefault === where.isDefault) Object.assign(row, data);
        });
        return Promise.resolve({ count: 1 });
      });
      prisma.invoiceTemplate.update.mockImplementation(({ where, data }: any) => {
        Object.assign(rows[where.id], data);
        return Promise.resolve(rows[where.id]);
      });

      await service.setDefault('ws-1', 'tpl-b');

      expect(prisma.invoiceTemplate.updateMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1', isDefault: true },
        data:  { isDefault: false },
      });
      expect(prisma.invoiceTemplate.update).toHaveBeenCalledWith({
        where: { id: 'tpl-b' },
        data:  { isDefault: true },
      });
      expect(rows['tpl-a'].isDefault).toBe(false);
      expect(rows['tpl-b'].isDefault).toBe(true);
    });

    it('covers AE3\'s Invoice equivalent: setting a different Invoice template as default un-defaults the previous one', async () => {
      const rows: Record<string, any> = {
        'tpl-a': makeTemplate({ id: 'tpl-a', isDefault: true }),
        'tpl-b': makeTemplate({ id: 'tpl-b', isDefault: false }),
      };
      prisma.invoiceTemplate.findFirst.mockImplementation(({ where }: any) => Promise.resolve(rows[where.id] ?? null));
      prisma.invoiceTemplate.updateMany.mockImplementation(({ where, data }: any) => {
        Object.values(rows).forEach((row) => {
          if (row.workspaceId === where.workspaceId && row.isDefault === where.isDefault) Object.assign(row, data);
        });
        return Promise.resolve({ count: 1 });
      });
      prisma.invoiceTemplate.update.mockImplementation(({ where, data }: any) => {
        Object.assign(rows[where.id], data);
        return Promise.resolve(rows[where.id]);
      });

      await service.setDefault('ws-1', 'tpl-b');

      expect(rows['tpl-a'].isDefault).toBe(false);
      expect(rows['tpl-b'].isDefault).toBe(true);
    });

    it('rejects setting a template as default when it is not in the caller\'s workspace', async () => {
      prisma.invoiceTemplate.findFirst.mockResolvedValue(null);

      await expect(service.setDefault('ws-1', 'tpl-other-ws')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('getDefault()', () => {
    it('returns null for a workspace with no default (pre-seed state)', async () => {
      prisma.invoiceTemplate.findFirst.mockResolvedValue(null);

      const result = await service.getDefault('ws-1');

      expect(prisma.invoiceTemplate.findFirst).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1', isDefault: true },
      });
      expect(result).toBeNull();
    });

    it('returns the serialized default Invoice template when one exists', async () => {
      prisma.invoiceTemplate.findFirst.mockResolvedValue(makeTemplate({ isDefault: true, totalAmount: 0 }));

      const result = await service.getDefault('ws-1');

      expect(result?.isDefault).toBe(true);
      expect(result?.totalAmount).toBe(0);
    });
  });

  describe('seedDefault()', () => {
    it('is a no-op the second time it is called for the same workspace (idempotency)', async () => {
      prisma.invoiceTemplate.upsert.mockResolvedValue(makeTemplate({ key: 'system-default', isSystem: true, isDefault: true }));

      await service.seedDefault('ws-1');
      await service.seedDefault('ws-1');

      expect(prisma.invoiceTemplate.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.invoiceTemplate.upsert).toHaveBeenNthCalledWith(1, {
        where:  { workspaceId_key: { workspaceId: 'ws-1', key: 'system-default' } },
        update: {},
        create: expect.objectContaining({
          workspaceId: 'ws-1',
          key:         'system-default',
          isSystem:    true,
          isDefault:   true,
          name:        'Standard Invoice',
        }),
      });
      // update is always {} -- the second call cannot mutate an existing row.
      expect(prisma.invoiceTemplate.upsert).toHaveBeenNthCalledWith(2, expect.objectContaining({ update: {} }));
    });
  });

  describe('remove()', () => {
    it('rejects deleting the seeded system Invoice template, even when it is not currently the default', async () => {
      prisma.invoiceTemplate.findUnique.mockResolvedValue(
        makeTemplate({ isSystem: true, isDefault: false }),
      );

      await expect(service.remove('ws-1', 'tpl-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.invoiceTemplate.delete).not.toHaveBeenCalled();
    });

    it('rejects deleting the current default Invoice template even when it is not a system template', async () => {
      prisma.invoiceTemplate.findUnique.mockResolvedValue(
        makeTemplate({ isSystem: false, isDefault: true }),
      );

      await expect(service.remove('ws-1', 'tpl-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.invoiceTemplate.delete).not.toHaveBeenCalled();
    });

    it('deletes a non-system, non-default Invoice template belonging to the caller\'s workspace', async () => {
      prisma.invoiceTemplate.findUnique.mockResolvedValue(
        makeTemplate({ isSystem: false, isDefault: false }),
      );
      prisma.invoiceTemplate.delete.mockResolvedValue({});

      const result = await service.remove('ws-1', 'tpl-1');

      expect(prisma.invoiceTemplate.delete).toHaveBeenCalledWith({ where: { id: 'tpl-1' } });
      expect(result).toEqual({ success: true });
    });
  });

  describe('update()/remove() workspace-scoping (KTD1 regression check)', () => {
    it('rejects update() on an Invoice template belonging to a different workspace', async () => {
      prisma.invoiceTemplate.findUnique.mockResolvedValue(makeTemplate({ workspaceId: 'ws-other' }));

      await expect(service.update('ws-1', 'tpl-1', { name: 'New name' } as any))
        .rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.invoiceTemplate.update).not.toHaveBeenCalled();
    });

    it('rejects remove() on an Invoice template belonging to a different workspace', async () => {
      prisma.invoiceTemplate.findUnique.mockResolvedValue(makeTemplate({ workspaceId: 'ws-other' }));

      await expect(service.remove('ws-1', 'tpl-1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.invoiceTemplate.delete).not.toHaveBeenCalled();
    });

    it('rejects update() with a NotFoundException when the template does not exist at all', async () => {
      prisma.invoiceTemplate.findUnique.mockResolvedValue(null);

      await expect(service.update('ws-1', 'missing', { name: 'x' } as any))
        .rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

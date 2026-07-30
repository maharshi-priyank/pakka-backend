import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NotFoundException } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../../prisma/prisma.service';

// R13/R14: findByIdPublic() flips SENT/OVERDUE -> VIEWED via an atomic conditional
// updateMany, and leaves every other status untouched.
describe('InvoicesService', () => {
  let service: InvoicesService;
  let prisma: {
    invoice: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
  };

  const owner = {
    email:              'owner@example.com',
    plan:                'FREE',
    planExpiresAt:       null,
    subscriptionStatus:  'CANCELLED',
  };

  const baseInvoice = {
    id:          'inv-1',
    workspaceId: 'ws-1',
    status:      'SENT',
    workspace:   { name: 'Acme', businessName: null, logoUrl: null, gstNumber: null, bankName: null, bankAccountName: null, bankAccountNumber: null, bankIfsc: null, upiId: null, upiQrUrl: null, country: null, taxLabel: null, ibanNumber: null, swiftCode: null, routingNumber: null },
    client:      { id: 'client-1', name: 'Client' },
  };

  beforeEach(async () => {
    prisma = {
      invoice: {
        findUnique: jest.fn(),
        updateMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
  });

  function mockInvoice(status: string) {
    prisma.invoice.findUnique.mockResolvedValue({ ...baseInvoice, status });
    prisma.user.findUnique.mockResolvedValue(owner);
  }

  it('transitions a SENT invoice to VIEWED on public view', async () => {
    mockInvoice('SENT');
    prisma.invoice.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.findByIdPublic('inv-1');

    expect(prisma.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv-1', status: { in: ['SENT', 'OVERDUE'] } },
      data:  { status: 'VIEWED' },
    });
    expect(result.status).toBe('VIEWED');
  });

  it('transitions an OVERDUE invoice to VIEWED on public view', async () => {
    mockInvoice('OVERDUE');
    prisma.invoice.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.findByIdPublic('inv-1');

    expect(prisma.invoice.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv-1', status: { in: ['SENT', 'OVERDUE'] } },
      data:  { status: 'VIEWED' },
    });
    expect(result.status).toBe('VIEWED');
  });

  it.each(['PAID', 'CANCELLED', 'PARTIAL', 'VIEWED'])(
    'leaves a %s invoice unchanged on public view',
    async (status) => {
      mockInvoice(status);
      // The conditional WHERE naturally excludes these statuses — no row matches, count 0.
      prisma.invoice.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.findByIdPublic('inv-1');

      expect(prisma.invoice.updateMany).toHaveBeenCalledWith({
        where: { id: 'inv-1', status: { in: ['SENT', 'OVERDUE'] } },
        data:  { status: 'VIEWED' },
      });
      expect(result.status).toBe(status);
    },
  );

  it('throws NotFoundException when the invoice does not exist', async () => {
    prisma.invoice.findUnique.mockResolvedValue(null);

    await expect(service.findByIdPublic('missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.invoice.updateMany).not.toHaveBeenCalled();
  });
});

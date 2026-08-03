import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AutomationsService } from '../automations/automations.service';
import { ContractTemplatesService } from '../contract-templates/contract-templates.service';
import { InvoiceTemplatesService } from '../invoice-templates/invoice-templates.service';
import { FormsService } from '../forms/forms.service';

// U4/KTD4: upsert() seeds default Contract/Invoice templates keyed by
// resolveWorkspaceId(user), not raw user.id -- unlike the pre-existing
// seedDefaultRules(user.id) call it sits alongside, this must resolve to the
// SHARED workspace a team member actually works in, not their own dormant
// owner-workspace, or getDefault() at document-generation time (which does
// use resolveWorkspaceId) would never find what was seeded here.
describe('UsersService.upsert()', () => {
  let service: UsersService;
  let prisma: {
    user:            { upsert: jest.Mock; update: jest.Mock };
    workspace:       { upsert: jest.Mock };
    workspaceMember: { upsert: jest.Mock };
  };
  let contractTemplates: { seedDefault: jest.Mock };
  let invoiceTemplates:  { seedDefault: jest.Mock };
  let forms:             { seedLeadCaptureForm: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user:            { upsert: jest.fn(), update: jest.fn() },
      workspace:       { upsert: jest.fn() },
      workspaceMember: { upsert: jest.fn() },
    };
    contractTemplates = { seedDefault: jest.fn() };
    invoiceTemplates  = { seedDefault: jest.fn() };
    forms             = { seedLeadCaptureForm: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService,            useValue: prisma },
        { provide: AutomationsService,       useValue: { seedDefaultRules: jest.fn() } },
        { provide: ContractTemplatesService, useValue: contractTemplates },
        { provide: InvoiceTemplatesService,  useValue: invoiceTemplates },
        { provide: FormsService,             useValue: forms },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('seeds both default templates under the owner’s own id for a brand-new user (owner, activeWorkspaceId unset)', async () => {
    prisma.user.upsert.mockResolvedValue({ id: 'owner-1', activeWorkspaceId: null, ownerId: null });

    await service.upsert({ id: 'owner-1', email: 'a@b.com', name: 'Owner' } as any);

    expect(contractTemplates.seedDefault).toHaveBeenCalledWith('owner-1');
    expect(invoiceTemplates.seedDefault).toHaveBeenCalledWith('owner-1');
    expect(forms.seedLeadCaptureForm).toHaveBeenCalledWith('owner-1');
  });

  it('seeds both default templates under the shared workspace for a team member (activeWorkspaceId differs from own id)', async () => {
    prisma.user.upsert.mockResolvedValue({ id: 'member-1', activeWorkspaceId: 'owner-1', ownerId: 'owner-1' });

    await service.upsert({ id: 'member-1', email: 'a@b.com', name: 'Member' } as any);

    expect(contractTemplates.seedDefault).toHaveBeenCalledWith('owner-1');
    expect(invoiceTemplates.seedDefault).toHaveBeenCalledWith('owner-1');
    expect(forms.seedLeadCaptureForm).toHaveBeenCalledWith('owner-1');
    expect(contractTemplates.seedDefault).not.toHaveBeenCalledWith('member-1');
    expect(invoiceTemplates.seedDefault).not.toHaveBeenCalledWith('member-1');
    expect(forms.seedLeadCaptureForm).not.toHaveBeenCalledWith('member-1');
  });

  it('backfills an existing workspace that has no seeded template yet (R10) — seedDefault is idempotent, so a repeat login is a no-op on the DB side but still called', async () => {
    prisma.user.upsert.mockResolvedValue({ id: 'owner-2', activeWorkspaceId: 'owner-2', ownerId: null });

    await service.upsert({ id: 'owner-2', email: 'a@b.com', name: 'Owner' } as any);
    await service.upsert({ id: 'owner-2', email: 'a@b.com', name: 'Owner' } as any);

    expect(contractTemplates.seedDefault).toHaveBeenCalledTimes(2);
    expect(contractTemplates.seedDefault).toHaveBeenNthCalledWith(1, 'owner-2');
    expect(contractTemplates.seedDefault).toHaveBeenNthCalledWith(2, 'owner-2');
  });
});

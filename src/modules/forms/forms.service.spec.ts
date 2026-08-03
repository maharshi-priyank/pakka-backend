import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FormsService } from './forms.service';
import { PrismaService } from '../../prisma/prisma.service';

// U2 (feat/website-lead-capture): submit() creates a Lead (never a Contact)
// tagged with sourceFormId, ONLY when the form has capturesLeads: true --
// scoped this way after realizing forms are used for many non-lead purposes
// (surveys, feedback) and shouldn't all feed the Leads inbox. Gated by the
// same FREE-plan active-lead cap LeadsService.create() enforces for manual
// creation, but skips silently rather than erroring the anonymous website
// visitor. Scoped to submit()'s Lead-creation branch only -- no existing
// spec file for FormsService before this plan.
describe('FormsService.submit', () => {
  let service: FormsService;
  let prisma: {
    intakeForm:           { findUnique: jest.Mock };
    intakeFormSubmission: { create: jest.Mock };
    user:                 { findUnique: jest.Mock };
    lead:                 { count: jest.Mock; create: jest.Mock };
  };
  let emitter: { emit: jest.Mock };

  const baseForm = {
    id: 'form-1',
    workspaceId: 'ws-1',
    title: 'Contact us',
    token: 'tok',
    isActive: true,
    capturesLeads: true,
    leadFieldMap: { name: 'f-name', email: 'f-email', budget: 'f-budget' },
  };

  beforeEach(async () => {
    prisma = {
      intakeForm:           { findUnique: jest.fn().mockResolvedValue(baseForm) },
      intakeFormSubmission: { create: jest.fn().mockResolvedValue({ id: 'sub-1' }) },
      user:                 { findUnique: jest.fn().mockResolvedValue({ plan: 'PRO', planExpiresAt: null, subscriptionStatus: 'ACTIVE' }) },
      lead:                 { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue({ id: 'lead-1' }) },
    };
    emitter = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FormsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: emitter },
      ],
    }).compile();

    service = module.get<FormsService>(FormsService);
  });

  it('creates a Lead tagged with sourceFormId, never a Contact, using leadFieldMap', async () => {
    await service.submit('tok', { answers: { 'f-name': 'Jane', 'f-email': 'jane@x.com', 'f-budget': '$1,200' } } as any);

    expect(prisma.lead.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        workspaceId:  'ws-1',
        sourceFormId: 'form-1',
        name:         'Jane',
        email:        'jane@x.com',
        source:       'Form: Contact us',
      }),
    }));
    expect(emitter.emit).toHaveBeenCalledWith('lead.created', { entityId: 'lead-1', workspaceId: 'ws-1' });
  });

  it('falls back to respondentName, then respondentEmail, then Unknown when name is not mapped', async () => {
    await service.submit('tok', { respondentEmail: 'anon@x.com', answers: {} } as any);

    expect(prisma.lead.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: 'anon@x.com' }),
    }));
  });

  it('leaves budget unset when the mapped field is non-numeric', async () => {
    await service.submit('tok', { answers: { 'f-budget': 'lots of money' } } as any);

    expect(prisma.lead.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ budget: undefined }),
    }));
  });

  it('skips Lead creation (but keeps the submission) when a FREE-plan workspace is already at its active-lead cap', async () => {
    prisma.user.findUnique.mockResolvedValue({ plan: 'FREE', planExpiresAt: null, subscriptionStatus: 'ACTIVE' });
    prisma.lead.count.mockResolvedValue(3);

    const result = await service.submit('tok', { answers: {} } as any);

    expect(prisma.intakeFormSubmission.create).toHaveBeenCalled();
    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalledWith('lead.created', expect.anything());
    expect(result).toEqual({ id: 'sub-1' });
  });

  it('never creates a Lead for a form that does not capture leads (a generic survey/feedback form)', async () => {
    prisma.intakeForm.findUnique.mockResolvedValue({ ...baseForm, capturesLeads: false });

    const result = await service.submit('tok', { answers: { 'f-name': 'Jane' } } as any);

    expect(prisma.intakeFormSubmission.create).toHaveBeenCalled();
    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(emitter.emit).not.toHaveBeenCalledWith('lead.created', expect.anything());
    expect(emitter.emit).toHaveBeenCalledWith('form.submitted', expect.anything());
    expect(result).toEqual({ id: 'sub-1' });
  });
});

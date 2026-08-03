import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LeadsService } from './leads.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ContactsService } from '../contacts/contacts.service';

// U3 (feat/website-lead-capture): convertToContact() is entirely separate
// code from the existing convertToClient() -- no shared code path, per KD3
// -- and reuses ContactsService.create() unchanged for the Contact +
// Thread + default-Project transaction. Also covers findAll()'s new
// hasSourceForm filter. Scoped to this plan's additions only -- no
// existing spec file for LeadsService before this plan.
describe('LeadsService', () => {
  let service: LeadsService;
  let prisma: {
    lead:      { findFirst: jest.Mock; update: jest.Mock; findMany: jest.Mock; count: jest.Mock; aggregate: jest.Mock };
    workspace: { findUnique: jest.Mock };
  };
  let emitter: { emit: jest.Mock };
  let contactsService: { create: jest.Mock };

  const baseLead = { id: 'lead-1', workspaceId: 'ws-1', name: 'Jane', email: null, phone: null, company: null, contactId: null };

  beforeEach(async () => {
    prisma = {
      lead:      { findFirst: jest.fn().mockResolvedValue(baseLead), update: jest.fn(), findMany: jest.fn(), count: jest.fn(), aggregate: jest.fn() },
      workspace: { findUnique: jest.fn().mockResolvedValue({ country: 'IN', currency: 'INR' }) },
    };
    emitter = { emit: jest.fn() };
    contactsService = { create: jest.fn().mockResolvedValue({ id: 'contact-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventEmitter2, useValue: emitter },
        { provide: ContactsService, useValue: contactsService },
      ],
    }).compile();

    service = module.get<LeadsService>(LeadsService);
  });

  describe('convertToContact', () => {
    it('creates a Contact via ContactsService.create() and sets lead.contactId', async () => {
      prisma.lead.update.mockResolvedValue({ ...baseLead, contactId: 'contact-1' });

      const result = await service.convertToContact('ws-1', 'lead-1', {});

      expect(contactsService.create).toHaveBeenCalledWith('ws-1', expect.objectContaining({ name: 'Jane', country: 'IN', currency: 'INR' }));
      expect(prisma.lead.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'lead-1' },
        data:  expect.objectContaining({ contactId: 'contact-1' }),
      }));
      expect(emitter.emit).toHaveBeenCalledWith('lead.convertedToContact', { entityId: 'lead-1', workspaceId: 'ws-1', contactId: 'contact-1' });
      expect(result).toEqual({ contact: { id: 'contact-1' } });
    });

    it('uses dto overrides for country/currency over the workspace defaults', async () => {
      await service.convertToContact('ws-1', 'lead-1', { country: 'US', currency: 'USD' });

      expect(contactsService.create).toHaveBeenCalledWith('ws-1', expect.objectContaining({ country: 'US', currency: 'USD' }));
    });

    it('throws BadRequestException when neither the dto nor the workspace supplies country/currency', async () => {
      prisma.workspace.findUnique.mockResolvedValue({ country: null, currency: null });

      await expect(service.convertToContact('ws-1', 'lead-1', {})).rejects.toThrow(BadRequestException);
      expect(contactsService.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the lead already has a contactId', async () => {
      prisma.lead.findFirst.mockResolvedValue({ ...baseLead, contactId: 'contact-already' });

      await expect(service.convertToContact('ws-1', 'lead-1', {})).rejects.toThrow(ConflictException);
      expect(contactsService.create).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for a lead in a different workspace', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);

      await expect(service.convertToContact('ws-1', 'lead-1', {})).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll hasSourceForm filter', () => {
    beforeEach(() => {
      prisma.lead.findMany.mockResolvedValue([]);
      prisma.lead.count.mockResolvedValue(0);
      prisma.lead.aggregate.mockResolvedValue({ _sum: { budget: null } });
    });

    it('filters to only sourceFormId-set leads when hasSourceForm=true', async () => {
      await service.findAll('ws-1', { hasSourceForm: true } as any);

      expect(prisma.lead.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ sourceFormId: { not: null } }),
      }));
    });

    it('excludes sourceFormId-set leads when hasSourceForm=false', async () => {
      await service.findAll('ws-1', { hasSourceForm: false } as any);

      expect(prisma.lead.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ sourceFormId: null }),
      }));
    });

    it('leaves the query unfiltered by source when hasSourceForm is omitted (regression check for existing callers)', async () => {
      await service.findAll('ws-1', {} as any);

      const where = prisma.lead.findMany.mock.calls[0][0].where;
      expect(where).not.toHaveProperty('sourceFormId');
    });
  });
});

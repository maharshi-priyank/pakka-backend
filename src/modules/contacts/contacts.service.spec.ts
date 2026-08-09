import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ContactsService } from './contacts.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EntitlementsService } from '../entitlements/entitlements.service';

// U1 (feat/contact-overview-tab): getOverviewStats() aggregates TimeEntry
// durationMins into a total-hours figure plus a 6-month bucketed series,
// mirroring dashboard.service.ts's getRevenueChart() month-loop shape.
// Scoped to this method only -- not a retroactive full-service test suite
// (no existing spec file for ContactsService before this plan).
describe('ContactsService.getOverviewStats', () => {
  let service: ContactsService;
  let prisma: {
    contact:   { findFirst: jest.Mock };
    timeEntry: { aggregate: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      contact:   { findFirst: jest.fn() },
      timeEntry: { aggregate: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        {
          provide: EntitlementsService,
          useValue: { assertWithinLimit: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ContactsService>(ContactsService);
  });

  it('returns totalHours and a 6-entry monthlyHours series for a contact with logged time', async () => {
    prisma.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
    prisma.timeEntry.aggregate
      .mockResolvedValueOnce({ _sum: { durationMins: 900 } }) // totalHours all-time call
      .mockResolvedValue({ _sum: { durationMins: 120 } });    // every monthly-loop call

    const result = await service.getOverviewStats('ws-1', 'contact-1');

    expect(result.totalHours).toBe(15); // 900 mins / 60
    expect(result.monthlyHours).toHaveLength(6);
    expect(result.monthlyHours[5].hours).toBe(2); // 120 mins / 60
    expect(prisma.contact.findFirst).toHaveBeenCalledWith({
      where: { id: 'contact-1', workspaceId: 'ws-1' },
    });
  });

  it('returns zeroed totals for a contact with no time entries, not an error', async () => {
    prisma.contact.findFirst.mockResolvedValue({ id: 'contact-1' });
    prisma.timeEntry.aggregate.mockResolvedValue({ _sum: { durationMins: null } });

    const result = await service.getOverviewStats('ws-1', 'contact-1');

    expect(result.totalHours).toBe(0);
    expect(result.monthlyHours.every(m => m.hours === 0)).toBe(true);
  });

  it('throws NotFoundException for a contact in a different workspace', async () => {
    prisma.contact.findFirst.mockResolvedValue(null);

    await expect(service.getOverviewStats('ws-1', 'contact-1')).rejects.toThrow(NotFoundException);
    expect(prisma.timeEntry.aggregate).not.toHaveBeenCalled();
  });
});

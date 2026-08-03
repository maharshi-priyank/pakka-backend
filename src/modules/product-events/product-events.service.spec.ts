import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ProductEventsService } from './product-events.service';
import { PRODUCT_EVENT_NAMES } from './product-events.contract';

describe('ProductEventsService', () => {
  let service: ProductEventsService;
  let prisma: Record<string, any>;

  beforeEach(() => {
    prisma = {
      productEvent: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      workspaceMember: {
        findUnique: jest.fn(),
      },
    };
    service = new ProductEventsService(prisma as any);
  });

  it('keeps the event contract allowlisted', () => {
    expect(PRODUCT_EVENT_NAMES).toContain('lead_created');
    expect(PRODUCT_EVENT_NAMES).toContain('session_started');
    expect(PRODUCT_EVENT_NAMES).not.toContain('raw_form_submitted');
  });

  it('records a normalized event for an authenticated workspace member', async () => {
    prisma.workspaceMember.findUnique.mockResolvedValue({ userId: 'user-1', workspaceId: 'workspace-1' });
    prisma.productEvent.findUnique.mockResolvedValue(null);
    prisma.productEvent.create.mockResolvedValue({
      id: 'event-1',
      eventName: 'lead_created',
      userId: 'user-1',
      workspaceId: 'workspace-1',
      idempotencyKey: 'request-1',
    });

    const result = await service.record('user-1', {
      eventName: 'lead_created',
      workspaceId: 'workspace-1',
      idempotencyKey: 'request-1',
      userId: 'other-user',
    } as any);

    expect(prisma.productEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: 'user-1', workspaceId: 'workspace-1', source: 'customer-app' }),
    }));
    expect(result).toMatchObject({ accepted: true, duplicate: false, eventId: 'event-1' });
  });

  it('returns the first event for a duplicate idempotency key without overwriting it', async () => {
    prisma.workspaceMember.findUnique.mockResolvedValue({ userId: 'user-1', workspaceId: 'workspace-1' });
    prisma.productEvent.findUnique.mockResolvedValue({ id: 'event-1', occurredAt: new Date('2026-08-03T10:00:00Z') });

    const result = await service.record('user-1', {
      eventName: 'lead_created', workspaceId: 'workspace-1', idempotencyKey: 'request-1',
    } as any);

    expect(prisma.productEvent.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ accepted: true, duplicate: true, eventId: 'event-1' });
  });

  it('rejects unknown events, secret-like properties, and oversized property sets', async () => {
    await expect(service.record('user-1', { eventName: 'not_allowed' } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.record('user-1', { eventName: 'lead_created', properties: { password: 'secret' } } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.record('user-1', {
      eventName: 'lead_created',
      properties: Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`key_${i}`, i])),
    } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects events for a workspace where the user is not a member', async () => {
    prisma.workspaceMember.findUnique.mockResolvedValue(null);

    await expect(service.record('user-1', {
      eventName: 'lead_created', workspaceId: 'workspace-2',
    } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.productEvent.create).not.toHaveBeenCalled();
  });
});

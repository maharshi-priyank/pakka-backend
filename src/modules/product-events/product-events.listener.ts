import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductEventsService } from './product-events.service';

type WorkspaceLifecycleEvent = { entityId?: string; workspaceId?: string };

@Injectable()
export class ProductEventsListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productEvents: ProductEventsService,
  ) {}

  /** Signing happens in the client portal, so the customer app cannot authoritatively observe it. */
  @OnEvent('contract.signed', { async: true })
  async recordContractSigned(event: WorkspaceLifecycleEvent) {
    if (!event.entityId || !event.workspaceId) return;
    const owner = await this.prisma.workspaceMember.findFirst({
      where: { workspaceId: event.workspaceId, role: 'OWNER' },
      select: { userId: true },
    });
    if (!owner) return;
    await this.productEvents.recordServerEvent({
      userId: owner.userId,
      workspaceId: event.workspaceId,
      eventName: 'contract_signed',
      idempotencyKey: `contract-signed:${event.entityId}`,
    });
  }
}

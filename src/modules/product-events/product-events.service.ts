import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import {
  PRODUCT_EVENT_NAMES,
  PRODUCT_EVENT_PROPERTY_KEYS,
  type ProductEventName,
} from './product-events.contract';
import { RecordProductEventDto } from './dto/record-product-event.dto';

type StoredEvent = {
  id: string;
  occurredAt: Date;
};

type ProductEventResult = {
  accepted: true;
  duplicate: boolean;
  eventId: string;
  occurredAt: Date;
};

const MAX_PROPERTIES = 50;
const MAX_STRING_VALUE_LENGTH = 160;
const CLIENT_EVENT_DRIFT_MS = 24 * 60 * 60 * 1000;
const SECRET_LIKE_KEY = /(password|secret|token|authorization|cookie|session|raw|payload|body|content|note)/i;

@Injectable()
export class ProductEventsService {
  private readonly logger = new Logger(ProductEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(userId: string, dto: RecordProductEventDto, defaultWorkspaceId?: string): Promise<ProductEventResult> {
    // Validate the client contract before tenant lookup so malformed analytics
    // requests fail consistently and never reveal workspace membership details.
    this.assertEventName(dto.eventName);
    this.sanitizeProperties(dto.eventName, dto.properties);
    const workspaceId = dto.workspaceId ?? defaultWorkspaceId ?? userId;
    const membership = await this.prisma.workspaceMember.findUnique({
      where: { userId_workspaceId: { userId, workspaceId } },
      select: { userId: true },
    });
    if (!membership) throw new ForbiddenException('You are not a member of this workspace.');

    return this.persist({
      userId,
      workspaceId,
      eventName: dto.eventName,
      eventVersion: dto.eventVersion ?? 1,
      occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
      idempotencyKey: dto.idempotencyKey?.trim() || randomUUID(),
      source: 'customer-app',
      properties: dto.properties,
      enforceClientDrift: true,
    });
  }

  /** Server-owned transitions (billing, webhooks, and other authoritative state changes). */
  async recordServerEvent(input: {
    userId: string;
    workspaceId?: string | null;
    eventName: ProductEventName;
    idempotencyKey: string;
    occurredAt?: Date;
    properties?: Record<string, unknown>;
  }): Promise<ProductEventResult> {
    return this.persist({
      userId: input.userId,
      workspaceId: input.workspaceId ?? input.userId,
      eventName: input.eventName,
      eventVersion: 1,
      occurredAt: input.occurredAt ?? new Date(),
      idempotencyKey: input.idempotencyKey,
      source: 'backend',
      properties: input.properties,
      enforceClientDrift: false,
    });
  }

  private async persist(input: {
    userId: string;
    workspaceId: string;
    eventName: string;
    eventVersion: number;
    occurredAt: Date;
    idempotencyKey: string;
    source: 'customer-app' | 'backend';
    properties?: Record<string, unknown>;
    enforceClientDrift: boolean;
  }): Promise<ProductEventResult> {
    this.assertEventName(input.eventName);
    if (!Number.isInteger(input.eventVersion) || input.eventVersion < 1 || input.eventVersion > 3) {
      throw new BadRequestException('Unsupported product event version.');
    }
    if (input.idempotencyKey.length > 128) {
      throw new BadRequestException('The idempotency key is too long.');
    }
    if (Number.isNaN(input.occurredAt.getTime())) {
      throw new BadRequestException('The event occurrence time is invalid.');
    }
    if (input.enforceClientDrift && Math.abs(Date.now() - input.occurredAt.getTime()) > CLIENT_EVENT_DRIFT_MS) {
      throw new BadRequestException('The event occurrence time is outside the accepted window.');
    }

    const properties = this.sanitizeProperties(input.eventName as ProductEventName, input.properties);
    const where = {
      userId_idempotencyKey: { userId: input.userId, idempotencyKey: input.idempotencyKey },
    };
    const existing = await this.prisma.productEvent.findUnique({ where, select: { id: true, occurredAt: true } }) as StoredEvent | null;
    if (existing) {
      return { accepted: true, duplicate: true, eventId: existing.id, occurredAt: existing.occurredAt };
    }

    try {
      const created = await this.prisma.productEvent.create({
        data: {
          eventName: input.eventName,
          eventVersion: input.eventVersion,
          occurredAt: input.occurredAt,
          userId: input.userId,
          workspaceId: input.workspaceId,
          idempotencyKey: input.idempotencyKey,
          source: input.source,
          properties: properties as any,
        },
        select: { id: true, occurredAt: true },
      }) as StoredEvent;
      return { accepted: true, duplicate: false, eventId: created.id, occurredAt: created.occurredAt };
    } catch (error: any) {
      if (error?.code !== 'P2002') throw error;
      const winner = await this.prisma.productEvent.findUnique({ where, select: { id: true, occurredAt: true } }) as StoredEvent | null;
      if (!winner) throw error;
      return { accepted: true, duplicate: true, eventId: winner.id, occurredAt: winner.occurredAt };
    }
  }

  private assertEventName(eventName: string): asserts eventName is ProductEventName {
    if (!PRODUCT_EVENT_NAMES.includes(eventName as ProductEventName)) {
      throw new BadRequestException(`Unsupported product event: ${eventName}`);
    }
  }

  private sanitizeProperties(eventName: ProductEventName, input?: Record<string, unknown>): Record<string, unknown> {
    if (input === undefined) return {};
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new BadRequestException('Product event properties must be an object.');
    }

    const entries = Object.entries(input);
    if (entries.length > MAX_PROPERTIES) {
      throw new BadRequestException('Too many product event properties.');
    }

    const allowed = new Set(PRODUCT_EVENT_PROPERTY_KEYS[eventName]);
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of entries) {
      if (SECRET_LIKE_KEY.test(key) || !allowed.has(key)) {
        throw new BadRequestException(`Product event property is not allowed: ${key}`);
      }
      if (typeof value === 'string') {
        if (value.length > MAX_STRING_VALUE_LENGTH) throw new BadRequestException(`Product event property is too long: ${key}`);
        sanitized[key] = value.trim();
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        sanitized[key] = value;
      } else {
        throw new BadRequestException(`Product event property has an unsupported value: ${key}`);
      }
    }
    return sanitized;
  }

  logWriteFailure(error: unknown, eventName: string): void {
    this.logger.warn(`Product event write failed for ${eventName}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../../prisma/prisma.service';

export interface PushPayload {
  title:    string
  body:     string
  url?:     string
  tag?:     string
  type?:    string
}

@Injectable()
export class PushService implements OnModuleInit {
  private readonly log = new Logger(PushService.name);
  private configured = false;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit() {
    const publicKey  = this.config.get<string>('webPush.publicKey');
    const privateKey = this.config.get<string>('webPush.privateKey');
    const subject    = this.config.get<string>('webPush.subject') ?? 'mailto:noreply@clinekt.io';

    if (!publicKey || !privateKey) {
      this.log.warn('VAPID keys not configured — push notifications disabled');
      return;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.configured = true;
    this.log.log('Web Push configured');
  }

  isEnabled(): boolean {
    return this.configured;
  }

  getPublicKey(): string | null {
    return this.config.get<string>('webPush.publicKey') ?? null;
  }

  /**
   * Send a push to every subscription belonging to a user.
   * Failed deliveries with 404/410 (subscription gone) are auto-pruned.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    if (!this.configured) return;

    const subs = await this.prisma.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return;

    const data = JSON.stringify(payload);

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            data,
            { TTL: 60 * 60 * 24 }, // 24 h
          );
        } catch (err: any) {
          const status = err?.statusCode;
          if (status === 404 || status === 410) {
            // Subscription expired or unsubscribed — clean up
            await this.prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
            this.log.debug(`Pruned dead subscription ${s.id} (status ${status})`);
          } else {
            this.log.warn(`Push send failed for sub ${s.id}: ${err?.message ?? err}`);
          }
        }
      }),
    );
  }
}

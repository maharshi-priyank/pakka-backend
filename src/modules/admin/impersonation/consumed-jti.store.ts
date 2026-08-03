import { Injectable, Logger } from '@nestjs/common';

/**
 * Replay guard for impersonation tokens (KTD5): tracks consumed `jti` values so
 * a replayed impersonation token is rejected. In-memory by default — suitable
 * for a single-process deployment. A Redis-backed implementation is deferred to
 * implementation (see Outstanding Questions) for multi-instance correctness.
 *
 * Entries expire after the impersonation window (default 15 min) so the set
 * does not grow unbounded.
 */
@Injectable()
export class ConsumedJtiStore {
  private readonly logger = new Logger(ConsumedJtiStore.name);
  private readonly seen = new Map<string, number>(); // jti -> expiresAtMs
  private readonly ttlMs = 30 * 60_000; // generous over the 15m token window

  consume(jti: string, expiresAtMs?: number): boolean {
    this.evict();
    if (this.seen.has(jti)) return false; // already consumed -> replay
    this.seen.set(jti, (expiresAtMs ?? Date.now() + this.ttlMs));
    return true;
  }

  has(jti: string): boolean {
    this.evict();
    return this.seen.has(jti);
  }

  private evict(): void {
    const now = Date.now();
    for (const [k, exp] of this.seen) {
      if (exp <= now) this.seen.delete(k);
    }
  }
}

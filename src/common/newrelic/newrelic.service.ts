import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Only the methods we actually call — avoids module name collision with newrelic.js config file
interface NrAgent {
  noticeError(err: Error, attrs?: Record<string, string | number | boolean>): void;
  addCustomAttributes(attrs: Record<string, string | number | boolean>): void;
  startSegment<T>(name: string, record: boolean, fn: () => T): T;
  recordMetric(name: string, value: number): void;
}

// Loaded at runtime; safe to require because main.ts already conditionally required it first
const nr: NrAgent | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('newrelic') as NrAgent;
  } catch {
    return null;
  }
})();

@Injectable()
export class NewRelicService {
  private readonly logger = new Logger(NewRelicService.name);
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.enabled =
      this.config.get<string>('nodeEnv') === 'production' &&
      !!this.config.get<string>('newRelic.licenseKey');

    if (this.enabled) {
      this.logger.log('New Relic agent active');
    }
  }

  /** Record a handled error so it appears in New Relic Errors Inbox */
  noticeError(error: Error, attributes?: Record<string, string | number | boolean>): void {
    if (!this.enabled || !nr) return;
    nr.noticeError(error, attributes);
  }

  /** Add custom attributes to the current transaction (e.g. tenantId, userId) */
  addCustomAttributes(attributes: Record<string, string | number | boolean>): void {
    if (!this.enabled || !nr) return;
    nr.addCustomAttributes(attributes);
  }

  /** Wrap an async callback in a named custom segment for fine-grained tracing */
  async startSegment<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (!this.enabled || !nr) return fn();
    return nr.startSegment(name, true, fn) as Promise<T>;
  }

  /** Record a custom metric (count/timing visible in New Relic dashboards) */
  recordMetric(name: string, value: number): void {
    if (!this.enabled || !nr) return;
    nr.recordMetric(`Custom/${name}`, value);
  }
}

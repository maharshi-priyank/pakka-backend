'use strict';

/**
 * New Relic agent configuration.
 * All values here are overridden by environment variables prefixed NEW_RELIC_.
 * Free tier: 100 GB/month ingest, 8 days retention.
 */
exports.config = {
  app_name: [process.env.NEW_RELIC_APP_NAME || 'pakka-backend'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY || '',

  // Keep distributed tracing on — it's free and gives request flow visibility
  distributed_tracing: { enabled: true },

  // Transaction tracer: capture slow queries and traces
  transaction_tracer: {
    enabled: true,
    transaction_threshold: 'apdex_f', // only slow transactions
    record_sql: 'obfuscated',
    explain_threshold: 500,
  },

  // Error collector: send unhandled exceptions to New Relic Errors Inbox
  error_collector: {
    enabled: true,
    ignore_status_codes: [400, 401, 403, 404, 422, 429],
  },

  // Logs in context: forward pino logs enriched with trace/span IDs
  application_logging: {
    enabled: true,
    forwarding: {
      enabled: true,
      max_samples_stored: 10000,
    },
    local_decorating: { enabled: false }, // we use @newrelic/pino-enricher instead
    metrics: { enabled: true },
  },

  // Browser monitoring: disabled (backend only)
  browser_monitoring: { enable_auto_instrument: false },

  logging: {
    // Agent's own diagnostic log level — warn keeps noise low in production
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  },
};

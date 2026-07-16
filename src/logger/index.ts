/**
 * Structured logging infrastructure for zerotrust
 * Supports JSON logging, correlation IDs, and Elasticsearch streaming
 */

import pino, { type LoggerOptions, type Logger as PinoLogger } from "pino";
import { getConfig } from "../config";
import { streamToSiem } from "../services/shared/siem.service";
import { REDACT_CENSOR, redactLogEntry } from "../shared/logRedaction";
import { type AuditPrincipal, principalAuditFields } from "../shared/principal";
import { fetchFixedUrl } from "../shared/safeFetch";
import type { zerotrustConfig } from "../shared/types";

export interface LogContext {
  correlationId?: string;
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp?: Date;
  [key: string]: unknown;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

const PINO_REDACT_PATHS = [
  "password",
  "passwd",
  "pwd",
  "secret",
  "token",
  "authorization",
  "cookie",
  "otp",
  "pin",
  "tfn",
  "apiKey",
  "api_key",
  "clientSecret",
  "client_secret",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "headers.authorization",
  "headers.cookie",
  "req.headers.authorization",
  "req.headers.cookie",
  "request.headers.authorization",
  "request.headers.cookie",
  "*.password",
  "*.secret",
  "*.token",
  "*.authorization",
  "*.cookie",
  "*.otp",
] as const;

function pinoOptions(config: zerotrustConfig): LoggerOptions {
  return {
    level: config.logging.level,
    base: null,
    messageKey: "message",
    timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
    formatters: {
      level: (label) => ({ level: label }),
    },
    redact: {
      paths: [...PINO_REDACT_PATHS],
      censor: REDACT_CENSOR,
    },
  };
}

function createPinoLogger(config: zerotrustConfig): PinoLogger {
  if (process.env.NODE_ENV !== "production" && config.logging.format === "text") {
    const transport = pino.transport({
      target: "pino-pretty",
      options: {
        colorize: Boolean(process.stdout.isTTY),
        messageKey: "message",
        translateTime: false,
        ignore: "pid,hostname",
      },
    });
    return pino(pinoOptions(config), transport);
  }
  return pino(pinoOptions(config), process.stdout);
}

class Logger {
  private config: zerotrustConfig;
  private context: LogContext = {};
  private pinoLogger: PinoLogger;
  private elasticsearchClient: any; // Will be populated if ES enabled

  constructor(config: zerotrustConfig, contextModule?: string) {
    this.config = config;
    this.pinoLogger = createPinoLogger(config);

    if (contextModule) {
      this.context.module = contextModule;
    }
  }

  /**
   * Set correlation ID (for tracing requests across services)
   */
  setCorrelationId(id: string): void {
    this.context.correlationId = id;
  }

  /**
   * Set user context
   */
  setUserContext(userId: string, sessionId?: string): void {
    this.context.userId = userId;
    if (sessionId) this.context.sessionId = sessionId;
  }

  /**
   * Set request context
   */
  setRequestContext(ipAddress: string, userAgent?: string): void {
    this.context.ipAddress = ipAddress;
    if (userAgent) this.context.userAgent = userAgent;
  }

  /**
   * Clear context
   */
  clearContext(): void {
    this.context = {};
  }

  /**
   * Merge additional key/value pairs into this logger's persistent context.
   */
  mergeContext(context: LogContext): void {
    Object.assign(this.context, context);
  }

  /**
   * Log debug message
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.log("debug", message, data);
  }

  /**
   * Log info message
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.log("info", message, data);
  }

  /**
   * Log warning message
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.log("warn", message, data);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | Record<string, unknown>): void {
    const errorData =
      error instanceof Error
        ? {
            errorMessage: error.message,
            errorStack: error.stack,
            errorName: error.name,
          }
        : error;
    this.log("error", message, errorData as Record<string, unknown>);
  }

  /**
   * Core logging function
   */
  private log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    const logEntry = redactLogEntry({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.context,
      ...data,
    });
    const { timestamp: _timestamp, level: _level, message: safeMessage, ...fields } = logEntry;
    this.pinoLogger[level](fields, String(safeMessage));

    // Stream to Elasticsearch if enabled
    if (this.config.elasticsearch.enabled && level !== "debug") {
      this.streamToElasticsearch(logEntry).catch((err) => {
        console.error("Failed to stream log to Elasticsearch:", err);
      });
    }
  }

  /**
   * Stream log to Elasticsearch
   */
  private async streamToElasticsearch(logEntry: Record<string, unknown>): Promise<void> {
    // Streaming is best-effort: when no Elasticsearch client is configured we
    // simply skip (logs still go to the console/file transports).
    if (!this.elasticsearchClient) {
      return;
    }

    try {
      const indexName = `${this.config.elasticsearch.indexPrefix}-logs-${
        new Date().toISOString().split("T")[0]
      }`;

      await this.elasticsearchClient.index({
        index: indexName,
        document: logEntry,
      });
    } catch (error) {
      console.error("Failed to index log in Elasticsearch:", error);
    }
  }

  /**
   * Set Elasticsearch client (called during initialization)
   */
  setElasticsearchClient(client: any): void {
    this.elasticsearchClient = client;
  }

  /**
   * Index a document directly into Elasticsearch under a custom index suffix
   * (e.g. "audit" instead of the default "logs"). No-op when ES isn't configured.
   */
  async indexToElasticsearch(
    indexSuffix: string,
    document: Record<string, unknown>
  ): Promise<void> {
    if (!this.elasticsearchClient) return;
    const indexName = `${this.config.elasticsearch.indexPrefix}-${indexSuffix}-${
      new Date().toISOString().split("T")[0]
    }`;
    await this.elasticsearchClient.index({ index: indexName, document });
  }
}

export type { Logger };

let loggerSingleton: Logger | null = null;

/**
 * Initialize global logger
 */
export function initializeLogger(config?: zerotrustConfig): Logger {
  if (loggerSingleton) return loggerSingleton;

  const cfg = config || getConfig();
  const logger = new Logger(cfg);

  // Initialize a minimal Elasticsearch client if enabled
  if (cfg.elasticsearch.enabled) {
    const host = cfg.elasticsearch.host;
    const port = cfg.elasticsearch.port;
    const base = `http://${host}:${port}`;
    const esClient = {
      index: async ({ index, document }: { index: string; document: Record<string, unknown> }) => {
        try {
          const url = `${base}/${index}/_doc`;
          await fetchFixedUrl(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(document),
          });
        } catch (err) {
          console.error("ES index error", err);
        }
      },
    };
    logger.setElasticsearchClient(esClient);
  }

  loggerSingleton = logger;
  return logger;
}

/**
 * Get global logger instance
 */
export function getLogger(module?: string): Logger {
  if (!loggerSingleton) {
    const cfg = getConfig();
    loggerSingleton = new Logger(cfg, module);
  }
  return loggerSingleton;
}

/**
 * Create a child logger with additional context
 */
export function createChildLogger(module: string, context?: LogContext): Logger {
  const logger = new Logger(getConfig(), module);
  if (context) logger.mergeContext(context);
  return logger;
}

/**
 * Audit log helper - specifically for security-sensitive operations
 * Always goes to both console and Elasticsearch
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function auditLog(
  action: string,
  actor: string,
  target: string,
  success: boolean,
  details?: Record<string, unknown>,
  error?: Error,
  principal?: AuditPrincipal
): Promise<void> {
  const logger = getLogger("audit");

  const auditEntry: Record<string, unknown> = {
    action,
    actor,
    target,
    success,
    timestamp: new Date().toISOString(),
    // Tag every event human-vs-agent (+ delegation chain) when a principal is
    // supplied; defaults to human so existing call sites stay valid.
    ...principalAuditFields(principal ?? { type: "human", id: actor }),
    ...details,
  };

  if (error) {
    auditEntry.error = {
      message: error.message,
      stack: error.stack,
    };
  }

  // Always log audit at info level minimum
  if (success) {
    logger.info(`AUDIT: ${action} by ${actor}`, auditEntry);
  } else {
    logger.warn(`AUDIT FAILED: ${action} by ${actor}`, auditEntry);
  }

  // Persist into the tamper-evident hash-chained audit_logs table (SOC 2
  // CC7). This used to be console/SIEM/ES only — the "AUDIT: ..." log line
  // looked like a durable record but was never written to the chain, so
  // sensitive actions (impersonation, plan overrides, billing changes,
  // takeover flags) left no immutable trail. Dynamic import avoids a static
  // circular dependency: audit/chain.ts calls getLogger() from this module
  // at load time (same reason services/shared/siem.service.ts documents for
  // not importing the logger back). A chain-write failure is logged loudly
  // but must not fail the caller's request — auditLog() has never thrown,
  // and callers up and down the stack (some `void auditLog(...)`) depend on
  // that contract.
  try {
    const { insertAuditLog } = await import("../audit/chain.js");
    await insertAuditLog({
      action,
      actorId: UUID_RE.test(actor) ? actor : null,
      targetId: target || null,
      success,
      resourceDetails: details ?? null,
      errorCode: error ? error.message.slice(0, 500) : null,
    });
  } catch (chainErr) {
    logger.error(
      `Failed to persist audit log to hash chain (action=${action}, actor=${actor})`,
      chainErr as Error
    );
  }

  // Fan out to an external SIEM when configured (fire-and-forget, never throws).
  void streamToSiem(auditEntry);

  // Stream to Elasticsearch
  if (getConfig().elasticsearch.enabled) {
    try {
      await logger.indexToElasticsearch("audit", auditEntry);
    } catch (err) {
      console.error("Failed to index audit log:", err);
    }
  }
}

/**
 * Reset logger (for testing)
 */
export function resetLogger(): void {
  loggerSingleton = null;
}

/**
 * Generate correlation ID
 */
export function generateCorrelationId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

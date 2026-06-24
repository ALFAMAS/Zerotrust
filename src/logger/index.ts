/**
 * Structured logging infrastructure for zerotrust
 * Supports JSON logging, correlation IDs, and Elasticsearch streaming
 */

import { getConfig } from "../config";
import { streamToSiem } from "../services/siem.service";
import { type AuditPrincipal, principalAuditFields } from "../shared/principal";
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

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private config: zerotrustConfig;
  private context: LogContext = {};
  private minLogLevel: number;
  private elasticsearchClient: any; // Will be populated if ES enabled

  constructor(config: zerotrustConfig, contextModule?: string) {
    this.config = config;
    this.minLogLevel = LOG_LEVELS[config.logging.level];

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
    if (LOG_LEVELS[level] < this.minLogLevel) {
      return; // Skip logs below configured level
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.context,
      ...data,
    };

    // Output based on configured format
    if (this.config.logging.format === "json") {
      process.stdout.write(`${JSON.stringify(logEntry)}\n`);
    } else {
      const levelColor = this.getLevelColor(level);
      const timestamp = String(logEntry.timestamp);
      const correlationId = logEntry.correlationId ? ` [${String(logEntry.correlationId)}]` : "";
      const userId = logEntry.userId ? ` [user:${String(logEntry.userId)}]` : "";
      const reset = "\x1b[0m";
      process.stdout.write(
        `${timestamp} ${levelColor}${level.toUpperCase()}${reset}${correlationId}${userId} ${message}\n`
      );
    }

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
   * Get ANSI color code for log level
   */
  private getLevelColor(level: LogLevel): string {
    const colors: Record<LogLevel, string> = {
      debug: "\x1b[36m", // Cyan
      info: "\x1b[32m", // Green
      warn: "\x1b[33m", // Yellow
      error: "\x1b[31m", // Red
    };
    return colors[level];
  }

  /**
   * Set Elasticsearch client (called during initialization)
   */
  setElasticsearchClient(client: any): void {
    this.elasticsearchClient = client;
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
          await fetch(url, {
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
  if (context) {
    for (const [key, value] of Object.entries(context)) {
      (logger as any).context[key] = value;
    }
  }
  return logger;
}

/**
 * Audit log helper - specifically for security-sensitive operations
 * Always goes to both console and Elasticsearch
 */
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

  // Fan out to an external SIEM when configured (fire-and-forget, never throws).
  void streamToSiem(auditEntry);

  // Stream to Elasticsearch
  if (getConfig().elasticsearch.enabled) {
    const es = (logger as any).elasticsearchClient;
    if (es) {
      try {
        const indexName = `${getConfig().elasticsearch.indexPrefix}-audit-${
          new Date().toISOString().split("T")[0]
        }`;
        await es.index({
          index: indexName,
          document: auditEntry,
        });
      } catch (err) {
        console.error("Failed to index audit log:", err);
      }
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

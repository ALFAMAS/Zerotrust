"use strict";
/**
 * Structured logging infrastructure for zerotrust
 * Supports JSON logging, correlation IDs, and Elasticsearch streaming
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeLogger = initializeLogger;
exports.getLogger = getLogger;
exports.createChildLogger = createChildLogger;
exports.auditLog = auditLog;
exports.resetLogger = resetLogger;
exports.generateCorrelationId = generateCorrelationId;
const config_1 = require("../config");
const siem_service_1 = require("../services/shared/siem.service");
const principal_1 = require("../shared/principal");
const safeFetch_1 = require("../shared/safeFetch");
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};
class Logger {
    constructor(config, contextModule) {
        this.context = {};
        this.config = config;
        this.minLogLevel = LOG_LEVELS[config.logging.level];
        if (contextModule) {
            this.context.module = contextModule;
        }
    }
    /**
     * Set correlation ID (for tracing requests across services)
     */
    setCorrelationId(id) {
        this.context.correlationId = id;
    }
    /**
     * Set user context
     */
    setUserContext(userId, sessionId) {
        this.context.userId = userId;
        if (sessionId)
            this.context.sessionId = sessionId;
    }
    /**
     * Set request context
     */
    setRequestContext(ipAddress, userAgent) {
        this.context.ipAddress = ipAddress;
        if (userAgent)
            this.context.userAgent = userAgent;
    }
    /**
     * Clear context
     */
    clearContext() {
        this.context = {};
    }
    /**
     * Merge additional key/value pairs into this logger's persistent context.
     */
    mergeContext(context) {
        Object.assign(this.context, context);
    }
    /**
     * Log debug message
     */
    debug(message, data) {
        this.log("debug", message, data);
    }
    /**
     * Log info message
     */
    info(message, data) {
        this.log("info", message, data);
    }
    /**
     * Log warning message
     */
    warn(message, data) {
        this.log("warn", message, data);
    }
    /**
     * Log error message
     */
    error(message, error) {
        const errorData = error instanceof Error
            ? {
                errorMessage: error.message,
                errorStack: error.stack,
                errorName: error.name,
            }
            : error;
        this.log("error", message, errorData);
    }
    /**
     * Core logging function
     */
    log(level, message, data) {
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
        }
        else {
            const levelColor = this.getLevelColor(level);
            const timestamp = String(logEntry.timestamp);
            const correlationId = logEntry.correlationId ? ` [${String(logEntry.correlationId)}]` : "";
            const userId = logEntry.userId ? ` [user:${String(logEntry.userId)}]` : "";
            const reset = "\x1b[0m";
            process.stdout.write(`${timestamp} ${levelColor}${level.toUpperCase()}${reset}${correlationId}${userId} ${message}\n`);
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
    async streamToElasticsearch(logEntry) {
        // Streaming is best-effort: when no Elasticsearch client is configured we
        // simply skip (logs still go to the console/file transports).
        if (!this.elasticsearchClient) {
            return;
        }
        try {
            const indexName = `${this.config.elasticsearch.indexPrefix}-logs-${new Date().toISOString().split("T")[0]}`;
            await this.elasticsearchClient.index({
                index: indexName,
                document: logEntry,
            });
        }
        catch (error) {
            console.error("Failed to index log in Elasticsearch:", error);
        }
    }
    /**
     * Get ANSI color code for log level
     */
    getLevelColor(level) {
        const colors = {
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
    setElasticsearchClient(client) {
        this.elasticsearchClient = client;
    }
    /**
     * Index a document directly into Elasticsearch under a custom index suffix
     * (e.g. "audit" instead of the default "logs"). No-op when ES isn't configured.
     */
    async indexToElasticsearch(indexSuffix, document) {
        if (!this.elasticsearchClient)
            return;
        const indexName = `${this.config.elasticsearch.indexPrefix}-${indexSuffix}-${new Date().toISOString().split("T")[0]}`;
        await this.elasticsearchClient.index({ index: indexName, document });
    }
}
let loggerSingleton = null;
/**
 * Initialize global logger
 */
function initializeLogger(config) {
    if (loggerSingleton)
        return loggerSingleton;
    const cfg = config || (0, config_1.getConfig)();
    const logger = new Logger(cfg);
    // Initialize a minimal Elasticsearch client if enabled
    if (cfg.elasticsearch.enabled) {
        const host = cfg.elasticsearch.host;
        const port = cfg.elasticsearch.port;
        const base = `http://${host}:${port}`;
        const esClient = {
            index: async ({ index, document }) => {
                try {
                    const url = `${base}/${index}/_doc`;
                    await (0, safeFetch_1.fetchFixedUrl)(url, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(document),
                    });
                }
                catch (err) {
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
function getLogger(module) {
    if (!loggerSingleton) {
        const cfg = (0, config_1.getConfig)();
        loggerSingleton = new Logger(cfg, module);
    }
    return loggerSingleton;
}
/**
 * Create a child logger with additional context
 */
function createChildLogger(module, context) {
    const logger = new Logger((0, config_1.getConfig)(), module);
    if (context)
        logger.mergeContext(context);
    return logger;
}
/**
 * Audit log helper - specifically for security-sensitive operations
 * Always goes to both console and Elasticsearch
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function auditLog(action, actor, target, success, details, error, principal) {
    const logger = getLogger("audit");
    const auditEntry = {
        action,
        actor,
        target,
        success,
        timestamp: new Date().toISOString(),
        // Tag every event human-vs-agent (+ delegation chain) when a principal is
        // supplied; defaults to human so existing call sites stay valid.
        ...(0, principal_1.principalAuditFields)(principal ?? { type: "human", id: actor }),
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
    }
    else {
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
    }
    catch (chainErr) {
        logger.error(`Failed to persist audit log to hash chain (action=${action}, actor=${actor})`, chainErr);
    }
    // Fan out to an external SIEM when configured (fire-and-forget, never throws).
    void (0, siem_service_1.streamToSiem)(auditEntry);
    // Stream to Elasticsearch
    if ((0, config_1.getConfig)().elasticsearch.enabled) {
        try {
            await logger.indexToElasticsearch("audit", auditEntry);
        }
        catch (err) {
            console.error("Failed to index audit log:", err);
        }
    }
}
/**
 * Reset logger (for testing)
 */
function resetLogger() {
    loggerSingleton = null;
}
/**
 * Generate correlation ID
 */
function generateCorrelationId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${timestamp}-${random}`;
}
//# sourceMappingURL=index.js.map
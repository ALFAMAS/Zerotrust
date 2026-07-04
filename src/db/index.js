"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.getReadDb = getReadDb;
exports.hasReadReplica = hasReadReplica;
exports.initializeDatabase = initializeDatabase;
exports.checkPendingMigrations = checkPendingMigrations;
exports.closeDatabase = closeDatabase;
exports.checkDatabaseHealth = checkDatabaseHealth;
exports.isDbConnected = isDbConnected;
exports.dropAllTables = dropAllTables;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const postgres_js_1 = require("drizzle-orm/postgres-js");
const postgres_1 = __importDefault(require("postgres"));
const config_1 = require("../config");
const schema = __importStar(require("./schema"));
let dbInstance = null;
let readDbInstance = null;
let sqlClient = null;
let readSqlClient = null;
let isConnected = false;
/**
 * Primary (write) database connection.
 * All mutations and schema operations must use this instance.
 */
function getDb() {
    if (!dbInstance) {
        throw new Error("Database not initialized. Call initializeDatabase() first.");
    }
    return dbInstance;
}
/**
 * Read replica connection.
 *
 * When DATABASE_URL_READ_REPLICA is set, this returns a separate Drizzle
 * instance connected to the replica. When it is not set, the primary
 * connection is returned as a safe fallback so callers never break.
 *
 * Use this for read-heavy queries (admin lists, analytics, status checks,
 * session lookups, etc.) to offload traffic from the primary.
 */
function getReadDb() {
    if (readDbInstance)
        return readDbInstance;
    return getDb();
}
/** Whether a dedicated read-replica connection is active. */
function hasReadReplica() {
    return readDbInstance !== null;
}
async function initializeDatabase() {
    if (isConnected && dbInstance) {
        return;
    }
    const cfg = (0, config_1.getConfig)();
    const url = cfg.database.databaseUrl;
    try {
        sqlClient = (0, postgres_1.default)(url, {
            max: cfg.database.connectionPoolSize,
            idle_timeout: 20,
            connect_timeout: 10,
        });
        dbInstance = (0, postgres_js_1.drizzle)(sqlClient, { schema });
        // Read replica: only when explicitly configured
        if (cfg.database.databaseUrlReadReplica) {
            readSqlClient = (0, postgres_1.default)(cfg.database.databaseUrlReadReplica, {
                max: cfg.database.readReplicaPoolSize,
                idle_timeout: 20,
                connect_timeout: 10,
                // Read-only mode: refuse writes at the postgres driver level
                ...(process.env.DB_READ_REPLICA_STRICT === "true"
                    ? { connection: { default_transaction_read_only: true } }
                    : {}),
            });
            readDbInstance = (0, postgres_js_1.drizzle)(readSqlClient, { schema });
        }
        isConnected = true;
    }
    catch (error) {
        console.error("✗ Failed to connect to database:", error);
        throw error;
    }
}
/**
 * Startup migration check.
 *
 * Compares the schema the running code expects (every pgTable defined in
 * `./schema`) against the columns actually present in the database, and warns
 * loudly when tables or columns are missing — i.e. when migrations have not
 * been applied. This is workflow-agnostic: it works whether the database is
 * kept in sync with `db:migrate` (which records `drizzle.__drizzle_migrations`)
 * or with `db:push` (which does not), so it catches schema drift either way.
 *
 * Best-effort: any failure is logged but never blocks startup.
 */
async function checkPendingMigrations() {
    if (!isConnected || !sqlClient)
        return;
    try {
        const tables = Object.values(schema).filter((v) => (0, drizzle_orm_1.is)(v, pg_core_1.PgTable));
        if (tables.length === 0)
            return;
        // Single round-trip: every column currently present in the public schema.
        const rows = await sqlClient `
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `;
        const actual = new Map();
        for (const r of rows) {
            if (!actual.has(r.table_name))
                actual.set(r.table_name, new Set());
            actual.get(r.table_name)?.add(r.column_name);
        }
        const missingTables = [];
        const missingColumns = [];
        for (const table of tables) {
            const name = (0, drizzle_orm_1.getTableName)(table);
            const cols = actual.get(name);
            if (!cols) {
                missingTables.push(name);
                continue;
            }
            for (const col of Object.values((0, drizzle_orm_1.getTableColumns)(table))) {
                if (!cols.has(col.name))
                    missingColumns.push(`${name}.${col.name}`);
            }
        }
        if (missingTables.length === 0 && missingColumns.length === 0) {
            return;
        }
        console.warn("⚠ Database schema is out of date — pending migrations detected:");
        if (missingTables.length > 0) {
            console.warn(`  Missing tables: ${missingTables.join(", ")}`);
        }
        if (missingColumns.length > 0) {
            console.warn(`  Missing columns: ${missingColumns.join(", ")}`);
        }
        console.warn('  Run "bun run db:migrate" (or "bun run db:push") to update the database.');
    }
    catch (error) {
        // The check must never prevent the server from starting.
        console.warn("⚠ Could not verify database migrations:", error.message);
    }
}
async function closeDatabase() {
    if (!isConnected)
        return;
    try {
        await sqlClient?.end();
        if (readSqlClient)
            await readSqlClient.end();
        dbInstance = null;
        readDbInstance = null;
        sqlClient = null;
        readSqlClient = null;
        isConnected = false;
    }
    catch (error) {
        console.error("✗ Error closing database:", error);
        throw error;
    }
}
async function checkDatabaseHealth() {
    if (!isConnected || !dbInstance) {
        return { status: "unhealthy", uptime: 0, connections: { current: 0, available: 0 } };
    }
    try {
        const result = await sqlClient `SELECT extract(epoch from now())::int as ts`;
        if (result.length > 0) {
            const health = {
                status: "healthy",
                uptime: 0,
                connections: { current: 1, available: 99 },
            };
            // Check replica health when configured
            if (readDbInstance && readSqlClient) {
                try {
                    const replicaResult = await readSqlClient `SELECT extract(epoch from now())::int as ts`;
                    health.replica = {
                        status: replicaResult.length > 0 ? "healthy" : "degraded",
                    };
                }
                catch {
                    health.replica = { status: "unhealthy" };
                }
            }
            return health;
        }
        return { status: "degraded", uptime: 0, connections: { current: 0, available: 0 } };
    }
    catch {
        return { status: "degraded", uptime: 0, connections: { current: 0, available: 0 } };
    }
}
function isDbConnected() {
    return isConnected && dbInstance !== null;
}
async function dropAllTables() {
    if (process.env.NODE_ENV === "production") {
        throw new Error("Cannot drop tables in production");
    }
    await sqlClient `
    DO $$ DECLARE
      r RECORD;
    BEGIN
      FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
      END LOOP;
    END $$;
  `;
}
//# sourceMappingURL=index.js.map
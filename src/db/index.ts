/**
 * Database connection management for ZeroAuth
 * Handles Mongoose initialization, connection pooling, and health checks
 */

import mongoose from "mongoose";
import type { ZeroAuthConfig } from "../shared/types";
import { getConfig } from "../config";

let isConnected = false;

/**
 * Initialize MongoDB connection
 */
export async function initializeDatabase(config?: ZeroAuthConfig): Promise<void> {
  const cfg = config || getConfig();

  if (isConnected) {
    console.log("Database already connected");
    return;
  }

  try {
    console.log(`Connecting to MongoDB at ${cfg.database.mongoUri.replace(/(:[^/]*@)/, ":***@")}`);

    await mongoose.connect(cfg.database.mongoUri, {
      maxPoolSize: cfg.database.connectionPoolSize,
      minPoolSize: 2,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      retryWrites: true,
      w: "majority",
      // Connection monitoring
      serverSelectionTimeoutMS: 5000,
    });

    isConnected = true;
    console.log("✓ Database connected successfully");

    // Setup connection event listeners
    setupConnectionListeners();
  } catch (error) {
    console.error("✗ Failed to connect to database:", error);
    throw error;
  }
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  if (!isConnected) {
    return;
  }

  try {
    console.log("Closing database connection...");
    await mongoose.disconnect();
    isConnected = false;
    console.log("✓ Database connection closed");
  } catch (error) {
    console.error("✗ Error closing database:", error);
    throw error;
  }
}

/**
 * Check database health
 */
export async function checkDatabaseHealth(): Promise<{
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  connections: {
    current: number;
    available: number;
  };
}> {
  if (!isConnected || !mongoose.connection) {
    return {
      status: "unhealthy",
      uptime: 0,
      connections: { current: 0, available: 0 },
    };
  }

  try {
    // Ping the database
    const adminDb = mongoose.connection.db?.admin();
    if (!adminDb) {
      return {
        status: "unhealthy",
        uptime: 0,
        connections: { current: 0, available: 0 },
      };
    }

    const pingResult = await adminDb.ping();

    if (!pingResult) {
      return {
        status: "unhealthy",
        uptime: 0,
        connections: { current: 0, available: 0 },
      };
    }

    // Get connection stats
    const client = mongoose.connection.getClient();
    const serverStatus = await adminDb.serverStatus();

    return {
      status: "healthy",
      uptime: serverStatus?.uptime || 0,
      connections: {
        current: serverStatus?.connections?.current || 0,
        available: serverStatus?.connections?.available || 0,
      },
    };
  } catch (error) {
    console.error("Database health check failed:", error);
    return {
      status: "degraded",
      uptime: 0,
      connections: { current: 0, available: 0 },
    };
  }
}

/**
 * Setup connection event listeners
 */
function setupConnectionListeners(): void {
  const connection = mongoose.connection;

  connection.on("connected", () => {
    console.log("[DB] Connected to MongoDB");
  });

  connection.on("error", (error) => {
    console.error("[DB] Connection error:", error);
    isConnected = false;
  });

  connection.on("disconnected", () => {
    console.log("[DB] Disconnected from MongoDB");
    isConnected = false;
  });

  connection.on("reconnected", () => {
    console.log("[DB] Reconnected to MongoDB");
    isConnected = true;
  });
}

/**
 * Get connection status
 */
export function isDbConnected(): boolean {
  return isConnected && mongoose.connection.readyState === 1;
}

/**
 * Drop all collections (WARNING: Use only in development/testing)
 */
export async function dropAllCollections(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Cannot drop collections in production");
  }

  try {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
    console.log("✓ All collections dropped");
  } catch (error) {
    console.error("✗ Error dropping collections:", error);
    throw error;
  }
}

import type { zerotrustConfig } from "../shared/types";

function generateSecureKey(byteLength: number): string {
  if (typeof crypto === "undefined") {
    throw new Error("Crypto API not available. Node.js 15+ required.");
  }
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const DEFAULT_CONFIG: Partial<zerotrustConfig> = {
  database: {
    databaseUrl:
      process.env.DATABASE_URL ||
      "postgresql://neon_owner:***@ep-noisy-hill-a1hjd9xk-pooler.ap-southeast-1.aws.neon.tech/neon?sslmode=require&channel_binding=require",
    databaseUrlReadReplica: process.env.DATABASE_URL_READ_REPLICA || undefined,
    connectionPoolSize: parseInt(process.env.DB_POOL_SIZE || "10", 10),
    readReplicaPoolSize: parseInt(process.env.DB_READ_POOL_SIZE || "20", 10),
  },
  session: {
    defaultTTL: parseInt(process.env.SESSION_TTL || "3600", 10),
    refreshTokenTTL: parseInt(process.env.REFRESH_TOKEN_TTL || "604800", 10),
    maxConcurrentDevices: parseInt(process.env.MAX_CONCURRENT_DEVICES || "5", 10),
  },
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || "12", 10),
    tokenSecretHex: process.env.TOKEN_SECRET_HEX || generateSecureKey(32),
    csfleMasterKeyHex: process.env.CSFLE_MASTER_KEY_HEX || generateSecureKey(32),
    csflekeyRotationIntervalDays: parseInt(process.env.CSFLE_KEY_ROTATION_DAYS || "90", 10),
  },
  oauth: {
    providers: {
      google: {
        clientId: process.env.OAUTH_GOOGLE_CLIENT_ID || "",
        clientSecret: process.env.OAUTH_GOOGLE_CLIENT_SECRET || "",
        redirectUri:
          process.env.OAUTH_GOOGLE_REDIRECT_URI ||
          "http://localhost:3000/auth/oauth/google/callback",
      },
      facebook: {
        clientId: process.env.OAUTH_FACEBOOK_CLIENT_ID || "",
        clientSecret: process.env.OAUTH_FACEBOOK_CLIENT_SECRET || "",
        redirectUri:
          process.env.OAUTH_FACEBOOK_REDIRECT_URI ||
          "http://localhost:3000/auth/oauth/facebook/callback",
      },
      github: {
        clientId: process.env.OAUTH_GITHUB_CLIENT_ID || "",
        clientSecret: process.env.OAUTH_GITHUB_CLIENT_SECRET || "",
        redirectUri:
          process.env.OAUTH_GITHUB_REDIRECT_URI ||
          "http://localhost:3000/auth/oauth/github/callback",
      },
      apple: {
        clientId: process.env.OAUTH_APPLE_CLIENT_ID || "",
        clientSecret: process.env.OAUTH_APPLE_CLIENT_SECRET || "",
        redirectUri:
          process.env.OAUTH_APPLE_REDIRECT_URI || "http://localhost:3000/auth/oauth/apple/callback",
      },
    },
  },
  mfa: {
    totpWindow: parseInt(process.env.TOTP_WINDOW || "1", 10),
    otpExpirySecs: parseInt(process.env.OTP_EXPIRY_SECS || "900", 10),
    maxOTPAttempts: parseInt(process.env.MAX_OTP_ATTEMPTS || "5", 10),
    channels: {
      email: { enabled: process.env.MFA_EMAIL_ENABLED !== "false" },
    },
  },
  rateLimiting: {
    enabled: process.env.RATE_LIMITING_ENABLED !== "false",
    redisUri: process.env.REDIS_URI,
    perIpLimit: parseInt(process.env.RATE_LIMIT_PER_IP || "100", 10),
    windowSecs: parseInt(process.env.RATE_LIMIT_WINDOW_SECS || "60", 10),
  },
  geofencing: {
    enabled: process.env.GEOFENCING_ENABLED === "true",
    allowedCountries: (process.env.ALLOWED_COUNTRIES || "US,AU,EU,BD,IN").split(","),
    allowedIpRanges: (process.env.ALLOWED_IP_RANGES || "").split(",").filter(Boolean),
  },
  elasticsearch: {
    enabled: process.env.ELASTICSEARCH_ENABLED === "true",
    host: process.env.ELASTICSEARCH_HOST || "localhost",
    port: parseInt(process.env.ELASTICSEARCH_PORT || "9200", 10),
    indexPrefix: process.env.ELASTICSEARCH_INDEX_PREFIX || "zerotrust",
  },
  logging: {
    level: (process.env.LOG_LEVEL || "info") as "debug" | "info" | "warn" | "error",
    format: (process.env.LOG_FORMAT || "json") as "json" | "text",
  },
};

export function loadConfig(): zerotrustConfig {
  const config = DEFAULT_CONFIG as zerotrustConfig;
  validateConfig(config);
  return config;
}

function validateConfig(config: zerotrustConfig): void {
  const errors: string[] = [];

  if (!config.database.databaseUrl) {
    errors.push("DATABASE_URL environment variable is required");
  }

  if (!config.security.tokenSecretHex || config.security.tokenSecretHex.length < 64) {
    errors.push("TOKEN_SECRET_HEX must be at least 32 bytes (64 hex chars)");
  }

  if (!config.security.csfleMasterKeyHex || config.security.csfleMasterKeyHex.length < 64) {
    errors.push("CSFLE_MASTER_KEY_HEX must be at least 32 bytes (64 hex chars)");
  }

  let hasValidOAuth = false;
  for (const creds of Object.values(config.oauth.providers)) {
    if (creds.clientId && creds.clientSecret) {
      hasValidOAuth = true;
    }
  }
  if (!hasValidOAuth) {
    console.warn(
      "WARNING: No OAuth providers configured. Set OAUTH_*_CLIENT_ID and OAUTH_*_CLIENT_SECRET"
    );
  }

  const mfaChannelsEnabled = config.mfa.channels.email.enabled ? 1 : 0;
  if (mfaChannelsEnabled === 0) {
    errors.push("At least one MFA channel must be enabled");
  }

  // ── Production-only fail-fast gates (P4.3) ─────────────────────────────
  // When NODE_ENV=production, refuse to boot unless critical operational
  // secrets are set. These are warnings/silent in dev but hard errors in prod.
  if (process.env.NODE_ENV === "production") {
    // /metrics must be token-gated in production
    if (!process.env.METRICS_AUTH_TOKEN) {
      errors.push(
        "METRICS_AUTH_TOKEN is required in production — /metrics is open without it. Generate with: openssl rand -hex 32"
      );
    }

    // CORS must be explicitly configured in production
    if (!process.env.CORS_ALLOWED_ORIGINS) {
      errors.push(
        "CORS_ALLOWED_ORIGINS is required in production — set it to your app/admin origins"
      );
    }

    // Redis is required for rate limiting, sessions, and BullMQ in production
    if (!process.env.REDIS_URI) {
      errors.push(
        "REDIS_URI is required in production — rate limiting, BullMQ queues, and session caching depend on it"
      );
    }

    // Backup encryption must be enabled when backups are in use
    if (process.env.BACKUP_ENABLED !== "false") {
      if (
        !process.env.BACKUP_ENCRYPTION_KEY_HEX ||
        process.env.BACKUP_ENCRYPTION_KEY_HEX.length < 64
      ) {
        errors.push(
          "BACKUP_ENCRYPTION_KEY_HEX must be at least 32 bytes (64 hex chars) in production, or set BACKUP_ENABLED=false to explicitly opt out. Generate with: openssl rand -hex 32"
        );
      }
      if (process.env.BACKUP_REQUIRE_ENCRYPTION !== "true") {
        errors.push(
          "BACKUP_REQUIRE_ENCRYPTION must be set to 'true' in production (or set BACKUP_ENABLED=false to opt out of backups)"
        );
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join("\n")}`);
  }
}

let configInstance: zerotrustConfig | null = null;

export function getConfig(): zerotrustConfig {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

export function resetConfig(): void {
  configInstance = null;
}

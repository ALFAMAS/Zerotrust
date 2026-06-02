import type { ZeroAuthConfig } from "../shared/types";

function generateSecureKey(byteLength: number): string {
  if (typeof crypto === "undefined") {
    throw new Error("Crypto API not available. Node.js 15+ required.");
  }
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const DEFAULT_CONFIG: Partial<ZeroAuthConfig> = {
  database: {
    databaseUrl:
      process.env.DATABASE_URL || "postgresql://zeroauth:password@localhost:5432/zeroauth",
    connectionPoolSize: parseInt(process.env.DB_POOL_SIZE || "10"),
  },
  session: {
    defaultTTL: parseInt(process.env.SESSION_TTL || "3600"),
    refreshTokenTTL: parseInt(process.env.REFRESH_TOKEN_TTL || "604800"),
    maxConcurrentDevices: parseInt(process.env.MAX_CONCURRENT_DEVICES || "5"),
  },
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || "12"),
    tokenSecretHex: process.env.TOKEN_SECRET_HEX || generateSecureKey(32),
    csfleMasterKeyHex: process.env.CSFLE_MASTER_KEY_HEX || generateSecureKey(32),
    csflekeyRotationIntervalDays: parseInt(process.env.CSFLE_KEY_ROTATION_DAYS || "90"),
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
          process.env.OAUTH_APPLE_REDIRECT_URI ||
          "http://localhost:3000/auth/oauth/apple/callback",
      },
    },
  },
  mfa: {
    totpWindow: parseInt(process.env.TOTP_WINDOW || "1"),
    otpExpirySecs: parseInt(process.env.OTP_EXPIRY_SECS || "900"),
    maxOTPAttempts: parseInt(process.env.MAX_OTP_ATTEMPTS || "5"),
    channels: {
      email: { enabled: process.env.MFA_EMAIL_ENABLED !== "false" },
      sms: {
        enabled: process.env.MFA_SMS_ENABLED === "true",
        provider: process.env.SMS_PROVIDER || "twilio",
      },
      whatsapp: {
        enabled: process.env.MFA_WHATSAPP_ENABLED === "true",
        provider: process.env.WHATSAPP_PROVIDER || "twilio",
      },
      telegram: {
        enabled: process.env.MFA_TELEGRAM_ENABLED === "true",
        botToken: process.env.TELEGRAM_BOT_TOKEN || "",
      },
    },
  },
  rateLimiting: {
    enabled: process.env.RATE_LIMITING_ENABLED !== "false",
    redisUri: process.env.REDIS_URI,
    perIpLimit: parseInt(process.env.RATE_LIMIT_PER_IP || "100"),
    windowSecs: parseInt(process.env.RATE_LIMIT_WINDOW_SECS || "60"),
  },
  geofencing: {
    enabled: process.env.GEOFENCING_ENABLED === "true",
    allowedCountries: (process.env.ALLOWED_COUNTRIES || "US,AU,EU,BD,IN").split(","),
    allowedIpRanges: (process.env.ALLOWED_IP_RANGES || "").split(",").filter(Boolean),
  },
  elasticsearch: {
    enabled: process.env.ELASTICSEARCH_ENABLED === "true",
    host: process.env.ELASTICSEARCH_HOST || "localhost",
    port: parseInt(process.env.ELASTICSEARCH_PORT || "9200"),
    indexPrefix: process.env.ELASTICSEARCH_INDEX_PREFIX || "zeroauth",
  },
  logging: {
    level: (process.env.LOG_LEVEL || "info") as "debug" | "info" | "warn" | "error",
    format: (process.env.LOG_FORMAT || "json") as "json" | "text",
  },
};

export function loadConfig(): ZeroAuthConfig {
  const config = DEFAULT_CONFIG as ZeroAuthConfig;
  validateConfig(config);
  return config;
}

function validateConfig(config: ZeroAuthConfig): void {
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

  const mfaChannelsEnabled = Object.values(config.mfa.channels).filter((c) => c.enabled).length;
  if (mfaChannelsEnabled === 0) {
    errors.push("At least one MFA channel must be enabled");
  }

  if (config.mfa.channels.telegram.enabled && !config.mfa.channels.telegram.botToken) {
    errors.push("TELEGRAM_BOT_TOKEN required when MFA_TELEGRAM_ENABLED=true");
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join("\n")}`);
  }
}

let configInstance: ZeroAuthConfig | null = null;

export function getConfig(): ZeroAuthConfig {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}

export function resetConfig(): void {
  configInstance = null;
}

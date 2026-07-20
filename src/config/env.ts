import { z } from "zod";
import { isPlaceholderSecretHex } from "../shared/placeholderSecrets";

const HEX_SECRET_64 = /^[0-9a-fA-F]{64}$/;

const optionalHexSecret = (label: string) =>
  z.string().regex(HEX_SECRET_64, `${label} must be at least 32 bytes (64 hex chars)`).optional();

/**
 * Zod schema for production-critical environment variables (SEC-21).
 * Called at boot via `loadConfig()` before route mount.
 *
 * Maps baseline names to repo conventions: `TOKEN_SECRET_HEX` (not SESSION_SECRET),
 * `REDIS_URI` (accepts `REDIS_URL` alias), `APP_URL` (not APP_ORIGIN).
 */
export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    DATABASE_URL: z.preprocess(
      (value) => (value === undefined || value === null ? "" : value),
      z.string().min(1, "DATABASE_URL environment variable is required")
    ),
    TOKEN_SECRET_HEX: optionalHexSecret("TOKEN_SECRET_HEX"),
    CSFLE_MASTER_KEY_HEX: optionalHexSecret("CSFLE_MASTER_KEY_HEX"),
    REDIS_URI: z.string().min(1).optional(),
    REDIS_URL: z.string().min(1).optional(),
    APP_URL: z.string().url().optional(),
    CORS_ALLOWED_ORIGINS: z.string().min(1).optional(),
    METRICS_AUTH_TOKEN: z.string().min(1).optional(),
    UNSUBSCRIBE_SECRET: z.string().min(1).optional(),
    STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
    BACKUP_ENCRYPTION_KEY_HEX: optionalHexSecret("BACKUP_ENCRYPTION_KEY_HEX"),
    BACKUP_REQUIRE_ENCRYPTION: z.string().optional(),
    BACKUP_ENABLED: z.string().optional(),
    API_DOCS_ENABLED: z.enum(["true", "false"]).optional(),
    QUEUE_DASHBOARD_ENABLED: z.enum(["true", "false"]).optional(),
  })
  .superRefine((env, ctx) => {
    const isProduction = env.NODE_ENV === "production";

    if (isProduction) {
      if (!env.TOKEN_SECRET_HEX) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "TOKEN_SECRET_HEX is required in production (it silently falls back to a random, " +
            "process-local key otherwise — breaking tokens across replicas/restarts). Generate with: openssl rand -hex 32",
        });
      }
      if (!env.CSFLE_MASTER_KEY_HEX) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "CSFLE_MASTER_KEY_HEX is required in production (it silently falls back to a random, " +
            "process-local key otherwise — making CSFLE-encrypted data unrecoverable on restart). Generate with: openssl rand -hex 32",
        });
      }
      if (!env.METRICS_AUTH_TOKEN) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "METRICS_AUTH_TOKEN is required in production — /metrics is open without it. Generate with: openssl rand -hex 32",
        });
      }
      if (!env.CORS_ALLOWED_ORIGINS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "CORS_ALLOWED_ORIGINS is required in production — set it to your app/admin origins",
        });
      }
      if (!env.UNSUBSCRIBE_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "UNSUBSCRIBE_SECRET is required in production — it signs email unsubscribe links; " +
            "without it token generation/verification throws, silently breaking notification " +
            "emails and returning 500 on unsubscribe. Generate with: openssl rand -hex 32",
        });
      }
      const redisUri = env.REDIS_URI ?? env.REDIS_URL;
      if (!redisUri) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "REDIS_URI is required in production — rate limiting, BullMQ queues, and session caching depend on it",
        });
      }

      if (env.BACKUP_ENABLED !== "false") {
        if (!env.BACKUP_ENCRYPTION_KEY_HEX) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "BACKUP_ENCRYPTION_KEY_HEX must be at least 32 bytes (64 hex chars) in production, or set BACKUP_ENABLED=false to explicitly opt out. Generate with: openssl rand -hex 32",
          });
        }
        if (env.BACKUP_REQUIRE_ENCRYPTION !== "true") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              "BACKUP_REQUIRE_ENCRYPTION must be set to 'true' in production (or set BACKUP_ENABLED=false to opt out of backups)",
          });
        }
      }

      for (const [name, value] of [
        ["TOKEN_SECRET_HEX", env.TOKEN_SECRET_HEX],
        ["CSFLE_MASTER_KEY_HEX", env.CSFLE_MASTER_KEY_HEX],
        ["BACKUP_ENCRYPTION_KEY_HEX", env.BACKUP_ENCRYPTION_KEY_HEX],
        ["METRICS_AUTH_TOKEN", env.METRICS_AUTH_TOKEN],
      ] as const) {
        if (value && isPlaceholderSecretHex(value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${name} is a documented placeholder value and cannot be used in production — generate with: openssl rand -hex 32`,
          });
        }
      }
    }
  });

export type ParsedEnv = z.infer<typeof EnvSchema>;

function formatZodErrors(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join("\n");
}

/** Parse and validate environment variables; throws on invalid config. */
export function parseEnv(raw: NodeJS.ProcessEnv = process.env): ParsedEnv {
  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Configuration validation failed:\n${formatZodErrors(result.error)}`);
  }
  return result.data;
}

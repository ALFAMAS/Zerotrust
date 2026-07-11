/**
 * Optional secrets manager integration (Tier 5 #22).
 *
 * Loads secrets from Vault KV v2, AWS Secrets Manager, or Doppler and overlays
 * `process.env` before config validation. Default provider `env` is a no-op.
 */
import { getLogger } from "../logger";
import { fetchFixedUrl } from "../shared/safeFetch";

const logger = getLogger("secrets-loader");

export type SecretsProvider = "env" | "vault" | "aws" | "doppler";

const SECRET_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;

function resolveProvider(raw: string | undefined): SecretsProvider {
  const value = (raw ?? "env").trim().toLowerCase();
  if (value === "env" || value === "vault" || value === "aws" || value === "doppler") {
    return value;
  }
  throw new Error(`Unknown SECRETS_PROVIDER="${raw}". Valid: env, vault, aws, doppler`);
}

function overlaySecrets(secrets: Record<string, string>): void {
  for (const [key, value] of Object.entries(secrets)) {
    if (!SECRET_KEY_PATTERN.test(key)) {
      logger.warn("Skipping secret key with invalid env name", { key });
      continue;
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function parseJsonSecrets(body: unknown): Record<string, string> {
  if (!body || typeof body !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

async function loadFromVault(env: NodeJS.ProcessEnv): Promise<Record<string, string>> {
  const addr = env.VAULT_ADDR?.replace(/\/$/, "");
  const token = env.VAULT_TOKEN;
  const mount = env.VAULT_MOUNT ?? "secret";
  const path = env.VAULT_SECRET_PATH ?? "zerotrust";
  if (!addr || !token) {
    throw new Error("VAULT_ADDR and VAULT_TOKEN are required when SECRETS_PROVIDER=vault");
  }

  const url = `${addr}/v1/${mount}/data/${path}`;
  const response = await fetchFixedUrl(url, {
    headers: { "X-Vault-Token": token, Accept: "application/json" },
    timeoutMs: 10_000,
  });
  if (!response.ok) {
    throw new Error(`Vault secrets fetch failed (${response.status})`);
  }
  const payload = (await response.json()) as {
    data?: { data?: Record<string, string> };
  };
  return payload.data?.data ?? {};
}

async function loadFromDoppler(env: NodeJS.ProcessEnv): Promise<Record<string, string>> {
  const token = env.DOPPLER_TOKEN;
  if (!token) {
    throw new Error("DOPPLER_TOKEN is required when SECRETS_PROVIDER=doppler");
  }

  const project = env.DOPPLER_PROJECT;
  const config = env.DOPPLER_CONFIG ?? "prd";
  const base = "https://api.doppler.com/v3/configs/config/secrets/download?format=json";
  const url =
    project != null && project.length > 0
      ? `${base}&project=${encodeURIComponent(project)}&config=${encodeURIComponent(config)}`
      : base;

  const response = await fetchFixedUrl(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    timeoutMs: 10_000,
  });
  if (!response.ok) {
    throw new Error(`Doppler secrets fetch failed (${response.status})`);
  }
  return parseJsonSecrets(await response.json());
}

async function loadFromAws(env: NodeJS.ProcessEnv): Promise<Record<string, string>> {
  const secretId = env.AWS_SECRET_ID;
  const region = env.AWS_REGION ?? env.AWS_DEFAULT_REGION ?? "us-east-1";
  if (!secretId) {
    throw new Error("AWS_SECRET_ID is required when SECRETS_PROVIDER=aws");
  }

  try {
    const { SecretsManagerClient, GetSecretValueCommand } = await import(
      "@aws-sdk/client-secrets-manager"
    );
    const client = new SecretsManagerClient({ region });
    const result = await client.send(new GetSecretValueCommand({ SecretId: secretId }));
    if (!result.SecretString) {
      throw new Error("AWS secret has no SecretString payload");
    }
    const parsed = JSON.parse(result.SecretString) as unknown;
    return parseJsonSecrets(parsed);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ERR_MODULE_NOT_FOUND") {
      throw new Error(
        "SECRETS_PROVIDER=aws requires optional dependency @aws-sdk/client-secrets-manager"
      );
    }
    throw err;
  }
}

/**
 * Load secrets from the configured provider and overlay unset env vars.
 * Never logs secret values (CWE-532).
 */
export async function loadSecrets(
  rawEnv: NodeJS.ProcessEnv = process.env
): Promise<Record<string, string>> {
  const provider = resolveProvider(rawEnv.SECRETS_PROVIDER);
  if (provider === "env") {
    return {};
  }

  logger.info("Loading secrets from external provider", { provider });

  let secrets: Record<string, string>;
  switch (provider) {
    case "vault":
      secrets = await loadFromVault(rawEnv);
      break;
    case "aws":
      secrets = await loadFromAws(rawEnv);
      break;
    case "doppler":
      secrets = await loadFromDoppler(rawEnv);
      break;
    default:
      secrets = {};
  }

  overlaySecrets(secrets);
  logger.info("Secrets overlay complete", { provider, keyCount: Object.keys(secrets).length });
  return secrets;
}

/** Reset loader state for tests. */
export function resetSecretsLoader(): void {
  // overlay is process-global; tests manipulate process.env directly
}

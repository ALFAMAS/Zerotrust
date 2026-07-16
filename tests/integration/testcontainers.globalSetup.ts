import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export const POSTGRES_TEST_IMAGE = "postgres:16.9-alpine";
export const REDIS_TEST_IMAGE = "redis:7.4.2-alpine";

async function applyMigrations(databaseUrl: string): Promise<void> {
  const client = postgres(databaseUrl, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  } finally {
    await client.end();
  }
}

function runtimeError(errors: unknown[]): Error {
  const detail = errors
    .map((error) => (error instanceof Error ? error.message : String(error)))
    .join("; ");
  return new Error(
    "Testcontainers integration tests require a running Docker-compatible container runtime. " +
      `Start Docker Desktop (or an equivalent runtime) and retry. ${detail}`
  );
}

export default async function setup() {
  const results = await Promise.allSettled([
    new PostgreSqlContainer(POSTGRES_TEST_IMAGE)
      .withDatabase("zerotrust_test")
      .withUsername("zerotrust")
      .withPassword("test-password")
      .start(),
    new RedisContainer(REDIS_TEST_IMAGE).start(),
  ] as const);

  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );
  if (failures.length > 0) {
    await Promise.allSettled(
      results
        .filter(
          (
            result
          ): result is PromiseFulfilledResult<StartedPostgreSqlContainer | StartedRedisContainer> =>
            result.status === "fulfilled"
        )
        .map((result) => result.value.stop())
    );
    throw runtimeError(failures.map((failure) => failure.reason));
  }

  const postgresContainer = results[0].value;
  const redisContainer = results[1].value;
  process.env.DATABASE_URL = postgresContainer.getConnectionUri();
  process.env.REDIS_URI = redisContainer.getConnectionUrl();
  process.env.NODE_ENV = "test";

  try {
    await applyMigrations(process.env.DATABASE_URL);
  } catch (error) {
    await Promise.allSettled([postgresContainer.stop(), redisContainer.stop()]);
    throw new Error(
      `Testcontainers started, but database migrations failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return async () => {
    await Promise.allSettled([redisContainer.stop(), postgresContainer.stop()]);
  };
}

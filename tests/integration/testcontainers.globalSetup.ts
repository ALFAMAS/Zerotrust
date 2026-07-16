import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { resolve } from "node:path";
import postgres from "postgres";
import {
  GenericContainer,
  Network,
  type StartedNetwork,
  type StartedTestContainer,
  Wait,
} from "testcontainers";

export const POSTGRES_TEST_IMAGE = "postgres:16.9-alpine";
export const REDIS_TEST_IMAGE = "redis:7.4.2-alpine";
export const PGBOUNCER_TEST_IMAGE = "edoburu/pgbouncer:v1.25.2-p0";
export const PGHERO_TEST_IMAGE = "ankane/pghero:v3.8.0";

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
  let network: StartedNetwork | undefined;
  let pgbouncerContainer: StartedTestContainer | undefined;
  let pgheroContainer: StartedTestContainer | undefined;

  try {
    network = await new Network().start();
  } catch (error) {
    throw runtimeError([error]);
  }

  const results = await Promise.allSettled([
    new PostgreSqlContainer(POSTGRES_TEST_IMAGE)
      .withDatabase("zerotrust_test")
      .withUsername("zerotrust")
      .withPassword("test-password")
      .withCommand([
        "postgres",
        "-c",
        "shared_preload_libraries=pg_stat_statements",
        "-c",
        "pg_stat_statements.track=all",
      ])
      .withCopyFilesToContainer([
        {
          source: resolve("scripts/ops/setup-pghero-readonly-role.sql"),
          target: "/tmp/setup-pghero-readonly-role.sql",
          mode: 0o600,
        },
      ])
      .withNetwork(network)
      .withNetworkAliases("postgres")
      .start(),
    new RedisContainer(REDIS_TEST_IMAGE)
      .withNetwork(network)
      .withNetworkAliases("redis")
      .start(),
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
    await network.stop();
    throw runtimeError(failures.map((failure) => failure.reason));
  }

  const postgresContainer = results[0].value;
  const redisContainer = results[1].value;
  const directDatabaseUrl = postgresContainer.getConnectionUri();

  try {
    await applyMigrations(directDatabaseUrl);

    const roleSetup = await postgresContainer.exec([
      "psql",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "zerotrust",
      "-d",
      "zerotrust_test",
      "-f",
      "/tmp/setup-pghero-readonly-role.sql",
    ]);
    if (roleSetup.exitCode !== 0) {
      throw new Error(`PgHero role setup failed: ${roleSetup.stderr}`);
    }

    const admin = postgres(directDatabaseUrl, { max: 1 });
    try {
      await admin.unsafe(
        "ALTER ROLE zerotrust_pghero_user PASSWORD 'test-pghero-password'"
      );
    } finally {
      await admin.end();
    }

    pgbouncerContainer = await new GenericContainer(PGBOUNCER_TEST_IMAGE)
      .withEnvironment({
        DB_USER: "zerotrust",
        DB_PASSWORD: "test-password",
        DB_HOST: "postgres",
        DB_PORT: "5432",
        DB_NAME: "zerotrust_test",
        AUTH_TYPE: "scram-sha-256",
        AUTH_FILE: "/var/run/pgbouncer/userlist.txt",
      })
      .withBindMounts([
        {
          source: resolve("infra/pgbouncer/pgbouncer.ini"),
          target: "/etc/pgbouncer/pgbouncer.ini",
          mode: "ro",
        },
      ])
      .withTmpFs({
        "/var/run/pgbouncer": "rw,noexec,nosuid,size=65536,mode=0700,uid=70,gid=70",
      })
      .withNetwork(network)
      .withNetworkAliases("pgbouncer")
      .withExposedPorts(6432)
      .withHealthCheck({
        test: ["CMD", "pg_isready", "-h", "127.0.0.1", "-p", "6432"],
        interval: 1_000,
        timeout: 5_000,
        retries: 20,
      })
      .withWaitStrategy(Wait.forHealthCheck())
      .withStartupTimeout(120_000)
      .start();

    pgheroContainer = await new GenericContainer(PGHERO_TEST_IMAGE)
      .withEnvironment({
        DATABASE_URL:
          "postgresql://zerotrust_pghero_user:test-pghero-password@postgres:5432/zerotrust_test",
      })
      .withNetwork(network)
      .withNetworkAliases("pghero")
      .withExposedPorts(8080)
      .withWaitStrategy(Wait.forHttp("/health", 8080).forStatusCode(200))
      .withStartupTimeout(120_000)
      .start();
  } catch (error) {
    await Promise.allSettled([
      pgheroContainer?.stop(),
      pgbouncerContainer?.stop(),
      postgresContainer.stop(),
      redisContainer.stop(),
    ]);
    await network.stop();
    throw new Error(
      `Testcontainers started, but database migrations or performance tooling startup failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  if (!pgbouncerContainer || !pgheroContainer) {
    throw new Error("Performance tooling containers did not start");
  }
  const startedPgBouncer = pgbouncerContainer;
  const startedPgHero = pgheroContainer;
  const pooledDatabaseUrl = `postgresql://zerotrust:test-password@${startedPgBouncer.getHost()}:${startedPgBouncer.getMappedPort(6432)}/zerotrust_test`;
  const pgheroDatabaseUrl = `postgresql://zerotrust_pghero_user:test-pghero-password@${postgresContainer.getHost()}:${postgresContainer.getPort()}/zerotrust_test`;
  process.env.DATABASE_MIGRATOR_URL = directDatabaseUrl;
  process.env.PGBOUNCER_TEST_URL = pooledDatabaseUrl;
  process.env.PGHERO_DATABASE_TEST_URL = pgheroDatabaseUrl;
  process.env.PGHERO_TEST_URL = `http://${startedPgHero.getHost()}:${startedPgHero.getMappedPort(8080)}`;
  process.env.DATABASE_URL = pooledDatabaseUrl;
  process.env.REDIS_URI = redisContainer.getConnectionUrl();
  process.env.NODE_ENV = "test";

  return async () => {
    await Promise.allSettled([
      startedPgHero.stop(),
      startedPgBouncer.stop(),
      redisContainer.stop(),
      postgresContainer.stop(),
    ]);
    await network.stop();
  };
}

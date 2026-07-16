import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PGBOUNCER_TEST_IMAGE,
  PGHERO_TEST_IMAGE,
  POSTGRES_TEST_IMAGE,
  REDIS_TEST_IMAGE,
} from "../../tests/integration/testcontainers.globalSetup";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("Testcontainers integration harness", () => {
  it("pins reproducible PostgreSQL and Redis image versions", () => {
    expect(POSTGRES_TEST_IMAGE).toBe("postgres:16.9-alpine");
    expect(REDIS_TEST_IMAGE).toBe("redis:7.4.2-alpine");
    expect(PGBOUNCER_TEST_IMAGE).toBe("edoburu/pgbouncer:v1.25.2-p0");
    expect(PGHERO_TEST_IMAGE).toBe("ankane/pghero:v3.8.0");
  });

  it("keeps container tests behind dedicated scripts and config", () => {
    const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["test:integration:containers"]).toContain("vitest.integration.config.ts");
    expect(pkg.scripts.test).not.toContain("vitest.integration.config.ts");

    const config = readFileSync(resolve(root, "vitest.integration.config.ts"), "utf8");
    expect(config).toContain("testcontainers.globalSetup.ts");
    expect(config).toContain("*.container.test.ts");

    const setup = readFileSync(
      resolve(root, "tests/integration/testcontainers.globalSetup.ts"),
      "utf8"
    );
    expect(setup).toContain("PGBOUNCER_TEST_URL");
    expect(setup).toContain("PGHERO_TEST_URL");
    expect(setup).toContain("infra/pgbouncer/pgbouncer.ini");
    expect(setup).toContain("setup-pghero-readonly-role.sql");
  });
});

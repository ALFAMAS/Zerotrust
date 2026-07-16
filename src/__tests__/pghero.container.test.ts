import postgres from "postgres";
import { describe, expect, it } from "vitest";

describe("PgHero read-only diagnostics profile", () => {
  it("serves the health endpoint from the pinned dashboard container", async () => {
    const baseUrl = process.env.PGHERO_TEST_URL;
    if (!baseUrl) throw new Error("PGHERO_TEST_URL is required");

    const response = await fetch(`${baseUrl}/health`);
    expect(response.status).toBe(200);
  });

  it("can read diagnostic views without elevated role attributes", async () => {
    const databaseUrl = process.env.PGHERO_DATABASE_TEST_URL;
    if (!databaseUrl) throw new Error("PGHERO_DATABASE_TEST_URL is required");
    const client = postgres(databaseUrl, { max: 1 });

    try {
      const [transaction] = await client<{ readOnly: string }[]>`
        select current_setting('default_transaction_read_only') as "readOnly"
      `;
      const [role] = await client<
        { isSuperuser: boolean; canCreateDb: boolean; canCreateRole: boolean }[]
      >`
        select
          rolsuper as "isSuperuser",
          rolcreatedb as "canCreateDb",
          rolcreaterole as "canCreateRole"
        from pg_catalog.pg_roles
        where rolname = current_user
      `;
      const [activity] = await client<{ count: number }[]>`
        select count(*)::int as count from pghero.pg_stat_activity
      `;
      const [statements] = await client<{ count: number }[]>`
        select count(*)::int as count from pghero.pg_stat_statements
      `;

      expect(transaction.readOnly).toBe("on");
      expect(role).toEqual({ isSuperuser: false, canCreateDb: false, canCreateRole: false });
      expect(activity.count).toBeGreaterThan(0);
      expect(statements.count).toBeGreaterThanOrEqual(0);
    } finally {
      await client.end();
    }
  });

  it("cannot write application data", async () => {
    const databaseUrl = process.env.PGHERO_DATABASE_TEST_URL;
    if (!databaseUrl) throw new Error("PGHERO_DATABASE_TEST_URL is required");
    const client = postgres(databaseUrl, { max: 1 });

    try {
      await expect(
        client`
          insert into users (email, display_name, status)
          values ('pghero-must-not-write@example.test', 'PgHero', 'active')
        `
      ).rejects.toThrow(/read-only|permission denied/i);
    } finally {
      await client.end();
    }
  });
});

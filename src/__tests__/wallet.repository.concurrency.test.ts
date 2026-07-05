import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Real-Postgres concurrency test for M6 (topUpWallet lost-update race).
 *
 * The previous implementation read the wallet balance, computed
 * `currentBalance + amount` in application code, then wrote that value back
 * with a plain UPDATE. Two concurrent top-ups could both read the same
 * "before" balance and each write their own stale `newBalance`, so whichever
 * transaction committed last would silently clobber the other's credit — a
 * mocked unit test can't actually observe that race (a mock has no real
 * transaction isolation to violate), so this exercises a real Postgres the
 * same way CI's "Tests" job does (it runs a live `postgres:16` service and
 * sets DATABASE_URL at the job level for exactly this reason).
 *
 * Falls back to a sensible local default when DATABASE_URL isn't already in
 * the environment (matches CI's / docker-compose's connection string), and
 * skips cleanly — rather than hanging on a hook timeout — when nothing is
 * listening, so this doesn't destabilize `bun run test` on a machine
 * without Postgres running.
 *
 * The env var is set at true module top level, and every app module that
 * could read it (../db, ../config via getConfig()'s module-level cache) is
 * imported dynamically AFTER that assignment — a static `import ... from
 * "../db"` here would be hoisted above this file's own code by the ESM spec,
 * running before the env var is set and permanently freezing getConfig()'s
 * cached databaseUrl on the wrong value.
 */
const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://zerotrust:password@localhost:5432/zerotrust_test";
process.env.DATABASE_URL ??= DATABASE_URL;

async function isPostgresReachable(url: string): Promise<boolean> {
  let client: ReturnType<typeof postgres> | undefined;
  try {
    client = postgres(url, { max: 1, connect_timeout: 2 });
    await client`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await client?.end({ timeout: 1 }).catch(() => {});
  }
}

const reachable = await isPostgresReachable(DATABASE_URL);
const describeIfDb = reachable ? describe : describe.skip;

if (!reachable) {
  console.warn(
    `Skipping wallet.repository concurrency tests — Postgres not reachable at ${DATABASE_URL}`
  );
}

describeIfDb("wallet.repository — concurrent top-ups (M6)", () => {
  const userId = randomUUID();
  let db: Awaited<ReturnType<typeof import("../db").getDb>>;
  let usersTable: typeof import("../db/schema").usersTable;
  let walletsTable: typeof import("../db/schema").walletsTable;
  let eq: typeof import("drizzle-orm").eq;
  let topUpWallet: typeof import("../db/repositories/wallet.repository").topUpWallet;
  let spendFromWallet: typeof import("../db/repositories/wallet.repository").spendFromWallet;
  let closeDatabase: typeof import("../db").closeDatabase;

  beforeAll(async () => {
    ({ eq } = await import("drizzle-orm"));
    const dbModule = await import("../db");
    const schema = await import("../db/schema");
    const repo = await import("../db/repositories/wallet.repository");
    usersTable = schema.usersTable;
    walletsTable = schema.walletsTable;
    topUpWallet = repo.topUpWallet;
    spendFromWallet = repo.spendFromWallet;
    closeDatabase = dbModule.closeDatabase;

    await dbModule.initializeDatabase();
    db = dbModule.getDb();
    await db.insert(usersTable).values({
      id: userId,
      email: `wallet-concurrency-${userId}@example.com`,
      displayName: "Wallet Concurrency Test",
    });
  });

  afterAll(async () => {
    // Cascades to wallets + wallet_transactions.
    await db.delete(usersTable).where(eq(usersTable.id, userId));
    await closeDatabase();
  });

  it("never loses a credit under concurrent top-ups", async () => {
    const concurrentTopUps = 20;
    const amountEach = 100;

    await Promise.all(
      Array.from({ length: concurrentTopUps }, () =>
        topUpWallet(userId, amountEach, { description: "concurrency test" })
      )
    );

    const [wallet] = await db
      .select()
      .from(walletsTable)
      .where(eq(walletsTable.userId, userId))
      .limit(1);

    expect(wallet.balance).toBe(concurrentTopUps * amountEach);
    expect(wallet.lifetimeBalance).toBe(concurrentTopUps * amountEach);
  });

  it("interleaved concurrent top-ups and spends settle to the correct balance", async () => {
    // Wallet already holds 2000 from the previous test. Fire 10 top-ups of
    // 50 and 10 spends of 30 concurrently; net change is +200.
    const [before] = await db
      .select()
      .from(walletsTable)
      .where(eq(walletsTable.userId, userId))
      .limit(1);

    const topUps = Array.from({ length: 10 }, () => topUpWallet(userId, 50));
    const spends = Array.from({ length: 10 }, () =>
      spendFromWallet(userId, 30).catch(() => null)
    );
    await Promise.all([...topUps, ...spends]);

    const [after] = await db
      .select()
      .from(walletsTable)
      .where(eq(walletsTable.userId, userId))
      .limit(1);

    expect(after.balance).toBe(before.balance + 10 * 50 - 10 * 30);
  });
});

import Redis from "ioredis";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

describe("Testcontainers infrastructure", () => {
  it("applies migrations to the shared PostgreSQL container", async () => {
    const client = postgres(process.env.DATABASE_URL as string, { max: 1 });
    try {
      const [result] = await client<{ users_table: string }[]>`
        select to_regclass('public.users')::text as users_table
      `;
      expect(result.users_table).toBe("users");
    } finally {
      await client.end();
    }
  });

  it("shares a reachable Redis container for the integration run", async () => {
    const redis = new Redis(process.env.REDIS_URI as string, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    try {
      await redis.connect();
      expect(await redis.ping()).toBe("PONG");
    } finally {
      await redis.quit();
    }
  });
});

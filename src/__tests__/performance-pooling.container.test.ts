import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

function pooledClient() {
  const url = process.env.PGBOUNCER_TEST_URL;
  if (!url) throw new Error("PGBOUNCER_TEST_URL is required");
  return postgres(url, { max: 8, prepare: true });
}

describe("PgBouncer transaction pooling compatibility", () => {
  it("supports prepared queries and multi-statement transactions under connection churn", async () => {
    const client = pooledClient();
    try {
      const values = await Promise.all(
        Array.from({ length: 32 }, (_, value) =>
          client.begin(async (tx) => {
            const [first] = await tx<{ value: number }[]>`select ${value}::int as value`;
            const [second] = await tx<{ doubled: number }[]>`
              select ${value * 2}::int as doubled
            `;
            return first.value + second.doubled;
          })
        )
      );

      expect(values).toEqual(Array.from({ length: 32 }, (_, value) => value * 3));
    } finally {
      await client.end();
    }
  });

  it("does not leak transaction-local tenant state between pooled requests", async () => {
    const client = pooledClient();
    try {
      for (let index = 0; index < 24; index += 1) {
        const orgId = randomUUID();
        const [inside] = await client.begin(async (tx) => {
          await tx`select set_config('app.org_id', ${orgId}, true)`;
          return tx<{ orgId: string }[]>`
            select current_setting('app.org_id', true) as "orgId"
          `;
        });
        expect(inside.orgId).toBe(orgId);

        const [outside] = await client<{ orgId: string | null }[]>`
          select nullif(current_setting('app.org_id', true), '') as "orgId"
        `;
        expect(outside.orgId).toBeNull();
      }
    } finally {
      await client.end();
    }
  });

  it("carries representative auth, org, billing, session, and audit writes atomically", async () => {
    const client = pooledClient();
    const marker = randomUUID();

    try {
      await expect(
        client.begin(async (tx) => {
          const [user] = await tx<{ id: string }[]>`
            insert into users (email, display_name, status)
            values (${`pool-${marker}@example.test`}, 'Pool Test', 'active')
            returning id
          `;
          const [org] = await tx<{ id: string }[]>`
            insert into organizations (name, slug, owner_id)
            values ('Pool Test', ${`pool-${marker}`}, ${user.id})
            returning id
          `;
          await tx`
            insert into organization_members (org_id, user_id, role, joined_at)
            values (${org.id}, ${user.id}, 'owner', now())
          `;
          await tx`
            insert into subscriptions (user_id, plan, status)
            values (${user.id}, 'pro', 'active')
          `;
          await tx`
            insert into sessions (user_id, token_id, ip_address, expires_at, active_org_id)
            values (${user.id}, ${`pool-${marker}`}, '127.0.0.1', now() + interval '1 hour', ${org.id})
          `;
          await tx`
            insert into audit_logs (action, actor_id, success)
            values ('pool.compatibility', ${user.id}, true)
          `;

          const [counts] = await tx<{ users: number; orgs: number; subscriptions: number }[]>`
            select
              (select count(*)::int from users where id = ${user.id}) as users,
              (select count(*)::int from organizations where id = ${org.id}) as orgs,
              (select count(*)::int from subscriptions where user_id = ${user.id}) as subscriptions
          `;
          expect(counts).toEqual({ users: 1, orgs: 1, subscriptions: 1 });

          throw new Error("ROLLBACK_COMPATIBILITY_FIXTURE");
        })
      ).rejects.toThrow("ROLLBACK_COMPATIBILITY_FIXTURE");

      const [persisted] = await client<{ count: number }[]>`
        select count(*)::int as count from users where email = ${`pool-${marker}@example.test`}
      `;
      expect(persisted.count).toBe(0);
    } finally {
      await client.end();
    }
  });
});

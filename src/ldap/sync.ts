import { getLogger } from "../logger/index.js";
import type { LDAPClient } from "./client.js";

export async function syncAllUsers(
  client: LDAPClient,
  tenantId?: string
): Promise<{ synced: number; errors: number }> {
  const logger = getLogger("ldap-sync");
  let synced = 0;
  let errors = 0;

  try {
    await client.bind();
    const users = await client.searchUsers();
    for (const user of users) {
      try {
        await client.syncUser(user, tenantId);
        synced++;
      } catch (err) {
        errors++;
        logger.warn("Failed to sync LDAP user", { dn: user.dn, error: String(err) });
      }
    }
  } finally {
    await client.close();
  }

  logger.info("LDAP full sync complete", { synced, errors, tenantId });
  return { synced, errors };
}

export async function syncModifiedUsers(
  client: LDAPClient,
  since: Date,
  tenantId?: string
): Promise<{ synced: number; errors: number }> {
  const logger = getLogger("ldap-sync");
  let synced = 0;
  let errors = 0;

  // LDAP generalized time format: YYYYMMDDHHmmssZ
  const pad = (n: number) => String(n).padStart(2, "0");
  const ldapTime =
    `${since.getUTCFullYear()}${pad(since.getUTCMonth() + 1)}${pad(since.getUTCDate())}` +
    `${pad(since.getUTCHours())}${pad(since.getUTCMinutes())}${pad(since.getUTCSeconds())}Z`;

  try {
    await client.bind();
    const users = await client.searchUsers(`(&(objectClass=person)(whenChanged>=${ldapTime}))`);
    for (const user of users) {
      try {
        await client.syncUser(user, tenantId);
        synced++;
      } catch (err) {
        errors++;
        logger.warn("Failed to sync modified LDAP user", { dn: user.dn, error: String(err) });
      }
    }
  } finally {
    await client.close();
  }

  logger.info("LDAP incremental sync complete", {
    synced,
    errors,
    since: since.toISOString(),
    tenantId,
  });
  return { synced, errors };
}

export function scheduleLDAPSync(intervalMs: number, tenantId?: string): NodeJS.Timeout {
  const logger = getLogger("ldap-sync");

  const run = async () => {
    const { createLDAPClient } = await import("./client.js");
    const client = createLDAPClient();
    try {
      const result = await syncAllUsers(client, tenantId);
      logger.info("Scheduled LDAP sync complete", result);
    } catch (err) {
      logger.error("Scheduled LDAP sync failed", err as Error);
    }
  };

  return setInterval(() => {
    void run();
  }, intervalMs);
}

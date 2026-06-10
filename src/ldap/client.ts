/**
 * LDAP / Active Directory client for ZeroAuth
 *
 * Production use: requires the `ldapts` npm package.
 *   npm install ldapts
 *
 * This module provides a clean interface that abstracts the ldapts library.
 * When ldapts is not installed, all methods return mock/empty results with
 * a warning, so the rest of the application can still start and the LDAP
 * routes can be registered.
 */

import type { LDAPConfig, LDAPUser, LDAPGroup } from "./types.js";
import { getDb } from "../db/index.js";
import { usersTable, rolesTable } from "../db/schema.js";
import { eq, inArray } from "drizzle-orm";
import { getLogger } from "../logger/index.js";

const logger = getLogger("ldap-client");

// ─── Default filter templates ─────────────────────────────────────────────────

const DEFAULT_USER_FILTER =
  "(&(objectClass=person)(|(sAMAccountName={{username}})(userPrincipalName={{username}})))";
const DEFAULT_GROUP_FILTER = "(&(objectClass=group)(member={{dn}}))";

const DEFAULT_USER_ATTRS = [
  "dn",
  "sAMAccountName",
  "userPrincipalName",
  "mail",
  "givenName",
  "sn",
  "displayName",
  "memberOf",
  "objectGUID",
  "whenCreated",
  "whenChanged",
];

const DEFAULT_GROUP_ATTRS = ["dn", "cn", "member"];

// ─── Attempt to import ldapts ─────────────────────────────────────────────────

let LdaptsClient: any = null;

try {
  // Dynamic require so the module still loads when ldapts is absent
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  LdaptsClient = require("ldapts").Client;
} catch {
  logger.warn(
    "ldapts package not installed — LDAP client is in mock mode. Run: npm install ldapts"
  );
}

// ─── LDAPClient ───────────────────────────────────────────────────────────────

export class LDAPClient {
  private client: any = null;
  private bound = false;

  constructor(private config: LDAPConfig) {}

  // ─── Internal helpers ──────────────────────────────────────────────────────

  private getClient(): any {
    if (!LdaptsClient) {
      throw new Error("ldapts is not installed. Run: npm install ldapts");
    }

    if (!this.client) {
      const isLdaps = this.config.url.startsWith("ldaps://");
      this.client = new LdaptsClient({
        url: this.config.url,
        timeout: this.config.timeout ?? 5000,
        connectTimeout: this.config.timeout ?? 5000,
        tlsOptions: isLdaps
          ? {
              rejectUnauthorized: this.config.tlsOptions?.rejectUnauthorized ?? true,
              ...(this.config.tlsOptions?.ca ? { ca: this.config.tlsOptions.ca } : {}),
            }
          : undefined,
      });
    }

    return this.client;
  }

  private buildFilter(template: string, vars: Record<string, string>): string {
    return Object.entries(vars).reduce(
      (f, [k, v]) => f.replace(new RegExp(`{{${k}}}`, "g"), v),
      template
    );
  }

  private entryToLDAPUser(entry: Record<string, any>): LDAPUser {
    const str = (v: any): string | undefined =>
      v === undefined || v === null ? undefined : Array.isArray(v) ? v[0] : String(v);
    const arr = (v: any): string[] | undefined =>
      v === undefined || v === null ? undefined : Array.isArray(v) ? v.map(String) : [String(v)];

    return {
      dn: str(entry.dn) ?? "",
      sAMAccountName: str(entry.sAMAccountName),
      userPrincipalName: str(entry.userPrincipalName),
      mail: str(entry.mail),
      givenName: str(entry.givenName),
      sn: str(entry.sn),
      displayName: str(entry.displayName),
      memberOf: arr(entry.memberOf),
      objectGUID: str(entry.objectGUID),
      whenCreated: str(entry.whenCreated),
      whenChanged: str(entry.whenChanged),
    };
  }

  private entryToLDAPGroup(entry: Record<string, any>): LDAPGroup {
    const str = (v: any): string => (Array.isArray(v) ? v[0] : String(v ?? ""));
    const arr = (v: any): string[] | undefined =>
      v === undefined || v === null ? undefined : Array.isArray(v) ? v.map(String) : [String(v)];

    return {
      dn: str(entry.dn),
      cn: str(entry.cn),
      member: arr(entry.member),
    };
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Bind (authenticate) to the LDAP server using the service account.
   * In production: uses ldapts Client.bind().
   */
  async bind(): Promise<void> {
    if (!LdaptsClient) {
      logger.warn("[LDAP mock] bind() called — ldapts not installed");
      this.bound = true;
      return;
    }

    const client = this.getClient();
    await client.bind(this.config.bindDN, this.config.bindPassword);
    this.bound = true;
    logger.debug("LDAP bind successful", { bindDN: this.config.bindDN });
  }

  /**
   * Authenticate an end-user against LDAP.
   *
   * Steps:
   *   1. Bind with the service account.
   *   2. Search for the user by sAMAccountName or userPrincipalName.
   *   3. Attempt a bind as the found user's DN with the provided password.
   *   4. If bind succeeds, return the user attributes; if it fails, return null.
   */
  async authenticate(username: string, password: string): Promise<LDAPUser | null> {
    if (!LdaptsClient) {
      logger.warn("[LDAP mock] authenticate() called — ldapts not installed");
      return null;
    }

    try {
      await this.bind();
      const users = await this.searchUsers(
        this.buildFilter(this.config.userSearchFilter ?? DEFAULT_USER_FILTER, { username })
      );

      if (users.length === 0) {
        logger.debug("LDAP authenticate: user not found", { username });
        return null;
      }

      const user = users[0];
      const client = this.getClient();

      // Attempt to bind as the user to validate the password
      try {
        await client.bind(user.dn, password);
        logger.debug("LDAP authenticate: success", { dn: user.dn });
        // Re-bind as service account for subsequent operations
        await client.bind(this.config.bindDN, this.config.bindPassword);
        return user;
      } catch {
        logger.debug("LDAP authenticate: bad password", { dn: user.dn });
        return null;
      }
    } catch (err) {
      logger.error("LDAP authenticate error", err as Error);
      return null;
    }
  }

  /**
   * Search for users in LDAP.
   *
   * @param filter    - LDAP search filter (overrides config default)
   * @param attributes - Attributes to retrieve (defaults to common AD attributes)
   */
  async searchUsers(filter?: string, attributes?: string[]): Promise<LDAPUser[]> {
    if (!LdaptsClient) {
      logger.warn("[LDAP mock] searchUsers() called — ldapts not installed");
      return [];
    }

    if (!this.bound) await this.bind();

    const client = this.getClient();
    const searchBase = this.config.userSearchBase ?? this.config.baseDN;
    const searchFilter = filter ?? this.config.userSearchFilter ?? "(objectClass=person)";
    const attrs = attributes ?? DEFAULT_USER_ATTRS;

    const { searchEntries } = await client.search(searchBase, {
      scope: "sub",
      filter: searchFilter,
      attributes: attrs,
    });

    return (searchEntries as any[]).map((e) => this.entryToLDAPUser(e));
  }

  /**
   * Search for groups that the user (identified by DN) is a member of.
   */
  async searchGroups(userDN: string): Promise<LDAPGroup[]> {
    if (!LdaptsClient) {
      logger.warn("[LDAP mock] searchGroups() called — ldapts not installed");
      return [];
    }

    if (!this.bound) await this.bind();

    const client = this.getClient();
    const searchBase = this.config.groupSearchBase ?? this.config.baseDN;
    const searchFilter = this.buildFilter(this.config.groupSearchFilter ?? DEFAULT_GROUP_FILTER, {
      dn: userDN,
    });

    const { searchEntries } = await client.search(searchBase, {
      scope: "sub",
      filter: searchFilter,
      attributes: DEFAULT_GROUP_ATTRS,
    });

    return (searchEntries as any[]).map((e) => this.entryToLDAPGroup(e));
  }

  /**
   * Upsert an LDAP user into ZeroAuth's UserModel and map groups to roles.
   *
   * - Uses userPrincipalName or mail as the email address.
   * - Maps the CN of each group to a ZeroAuth role by name (case-insensitive).
   */
  async syncUser(ldapUser: LDAPUser, tenantId?: string): Promise<void> {
    const email = ldapUser.userPrincipalName ?? ldapUser.mail;
    if (!email) {
      logger.warn("LDAP syncUser: skipping user with no email/UPN", { dn: ldapUser.dn });
      return;
    }

    const fullName = [ldapUser.givenName, ldapUser.sn].filter(Boolean).join(" ");
    const displayName = ldapUser.displayName ?? (fullName || (ldapUser.sAMAccountName ?? email));

    // Resolve group CNs to ZeroAuth role names
    const memberOf = ldapUser.memberOf ?? [];
    const groupCNs = memberOf
      .map((dn) => {
        const match = dn.match(/^CN=([^,]+)/i);
        return match ? match[1].toLowerCase() : null;
      })
      .filter((cn): cn is string => cn !== null);

    // Find matching roles in ZeroAuth via Drizzle
    let roles: string[] = [];
    if (groupCNs.length > 0) {
      const db = getDb();
      const matchedRoles = await db
        .select({ name: rolesTable.name })
        .from(rolesTable)
        .where(inArray(rolesTable.name, groupCNs));
      roles = matchedRoles.map((r) => r.name);
    }

    const normalizedEmail = email.toLowerCase();
    const metadata: Record<string, unknown> = {
      ldapDN: ldapUser.dn,
      ldapSyncedAt: new Date().toISOString(),
    };
    if (tenantId) metadata["tenantId"] = tenantId;

    const attributes: Record<string, unknown> = {};
    if (ldapUser.givenName) attributes["department"] = ldapUser.givenName;

    const db = getDb();

    // Check if user exists
    const existing = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(usersTable)
        .set({
          displayName,
          status: "active",
          roles,
          metadata,
          attributes,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.email, normalizedEmail));
    } else {
      await db.insert(usersTable).values({
        email: normalizedEmail,
        displayName,
        status: "active",
        roles,
        metadata,
        attributes,
      });
    }

    logger.debug("LDAP syncUser: upserted user", { email, roles });
  }

  /**
   * Close the LDAP connection.
   */
  async close(): Promise<void> {
    if (this.client) {
      try {
        await this.client.unbind();
      } catch {
        // best effort
      }
      this.client = null;
      this.bound = false;
    }
  }
}

// ─── Singleton factory ─────────────────────────────────────────────────────────

/**
 * Create an LDAPClient from explicit config or environment variables.
 *
 * Environment variables:
 *   LDAP_URL            — ldap:// or ldaps:// URL
 *   LDAP_BASE_DN        — Base DN (e.g. DC=example,DC=com)
 *   LDAP_BIND_DN        — Service account DN
 *   LDAP_BIND_PASSWORD  — Service account password
 *   LDAP_USER_SEARCH_BASE (optional)
 *   LDAP_USER_SEARCH_FILTER (optional)
 *   LDAP_GROUP_SEARCH_BASE (optional)
 *   LDAP_GROUP_SEARCH_FILTER (optional)
 *   LDAP_TIMEOUT_MS (optional, default 5000)
 *   LDAP_TLS_REJECT_UNAUTHORIZED (optional, "false" to disable)
 */
export function createLDAPClient(config?: Partial<LDAPConfig>): LDAPClient {
  const resolved: LDAPConfig = {
    url: config?.url ?? process.env.LDAP_URL ?? "ldap://localhost:389",
    baseDN: config?.baseDN ?? process.env.LDAP_BASE_DN ?? "DC=example,DC=com",
    bindDN: config?.bindDN ?? process.env.LDAP_BIND_DN ?? "",
    bindPassword: config?.bindPassword ?? process.env.LDAP_BIND_PASSWORD ?? "",
    userSearchBase: config?.userSearchBase ?? process.env.LDAP_USER_SEARCH_BASE,
    userSearchFilter: config?.userSearchFilter ?? process.env.LDAP_USER_SEARCH_FILTER,
    groupSearchBase: config?.groupSearchBase ?? process.env.LDAP_GROUP_SEARCH_BASE,
    groupSearchFilter: config?.groupSearchFilter ?? process.env.LDAP_GROUP_SEARCH_FILTER,
    timeout:
      config?.timeout ??
      (process.env.LDAP_TIMEOUT_MS ? parseInt(process.env.LDAP_TIMEOUT_MS, 10) : 5000),
    tlsOptions: {
      rejectUnauthorized: process.env.LDAP_TLS_REJECT_UNAUTHORIZED !== "false",
      ...(config?.tlsOptions ?? {}),
    },
  };

  return new LDAPClient(resolved);
}

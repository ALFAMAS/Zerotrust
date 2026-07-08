/**
 * One-shot DI-1 helper: split src/db/schema/tables.ts into domain modules.
 * Run: bun scripts/split-schema-domains.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const content = readFileSync(join(root, "src/db/schema/tables.ts"), "utf8");

const imports = `import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
`;

const domains: Record<string, string[]> = {
  identity: [
    "usersTable",
    "sessionsTable",
    "rolesTable",
    "jitAccessTable",
    "refreshTokensTable",
    "otpsTable",
    "oauthExchangeCodesTable",
    "userBehaviorBaselinesTable",
    "passkeysTable",
    "securityEventsTable",
  ],
  organizations: [
    "organizationsTable",
    "orgSecurityPoliciesTable",
    "organizationMembersTable",
    "organizationInvitesTable",
    "orgCustomRolesTable",
    "trustedDevicesTable",
    "crossTenantJITRequestsTable",
  ],
  audit: ["auditLogsTable", "auditLogAnchorsTable", "accessReviewsTable", "accessReviewItemsTable"],
  platform: [
    "saasSettingsTable",
    "notificationsTable",
    "pushSubscriptionsTable",
    "emailSuppressionsTable",
    "feedbackTable",
  ],
  support: ["supportTicketsTable", "supportTicketMessagesTable"],
  api: ["apiKeysTable"],
  billing: [
    "subscriptionsTable",
    "pointsLedgerTable",
    "processedStripeEventsTable",
    "usageCountersTable",
    "walletsTable",
    "walletTransactionsTable",
    "taxExemptionsTable",
  ],
  webhooks: ["webhookEndpointsTable", "webhookDeliveryLogsTable", "processedWebhookEventsTable"],
  compliance: ["soc2ControlsTable", "riskAssessmentsTable"],
  files: ["fileAttachmentsTable"],
};

const domainImports: Record<string, string> = {
  identity: "",
  organizations: 'import { usersTable } from "./identity";\n',
  audit: 'import { usersTable } from "./identity";\n',
  platform:
    'import { usersTable } from "./identity";\nimport { organizationsTable } from "./organizations";\n',
  support:
    'import { usersTable } from "./identity";\nimport { organizationsTable } from "./organizations";\n',
  api: 'import { usersTable } from "./identity";\nimport { organizationsTable } from "./organizations";\n',
  billing:
    'import { usersTable } from "./identity";\nimport { organizationsTable } from "./organizations";\n',
  webhooks: 'import { organizationsTable } from "./organizations";\n',
  compliance: "",
  files:
    'import { usersTable } from "./identity";\nimport { organizationsTable } from "./organizations";\n',
};

const tableRegex = /export const (\w+) = pgTable[\s\S]*?\n(?:\);|\}\);)/g;
const blocks: Record<string, string> = {};
for (;;) {
  const match = tableRegex.exec(content);
  if (!match) {
    break;
  }
  blocks[match[1]] = match[0];
}

for (const [domain, tables] of Object.entries(domains)) {
  const parts: string[] = [];
  for (const t of tables) {
    if (!blocks[t]) {
      console.error(`Missing table block: ${t}`);
      process.exit(1);
    }
    parts.push(blocks[t]);
  }
  const needsBranding = domain === "organizations";
  const brandingImport = needsBranding ? 'import type { OrgBranding } from "./types";\n' : "";
  const file =
    `/** DI-1 — ${domain} domain tables. */\n` +
    imports +
    brandingImport +
    domainImports[domain] +
    "\n" +
    parts.join("\n\n") +
    "\n";
  writeFileSync(join(root, "src/db/schema", `${domain}.ts`), file);
  console.info(`Wrote ${domain} (${tables.length} tables)`);
}

const barrel =
  "/** DI-1 — domain table barrel (replaces monolithic tables.ts). */\n" +
  Object.keys(domains)
    .map((d) => `export * from "./${d}";`)
    .join("\n") +
  "\n";
writeFileSync(join(root, "src/db/schema/tables.ts"), barrel);
console.info("Updated tables.ts barrel");

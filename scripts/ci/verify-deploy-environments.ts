#!/usr/bin/env bun
/**
 * Verify GitHub Actions deployment environments required by OPS-ENV-1.
 *
 * Checks that protected `staging` and `production` environments exist on the
 * remote. Does not read or print secret values — only environment metadata.
 *
 * Usage: bun scripts/ci/verify-deploy-environments.ts [owner/repo]
 * Requires: `gh` CLI authenticated with permission to read environments.
 *
 * Secret/variable values must still be configured by an operator per
 * docs/deployment.md § Automated staging/production deploy.
 */
import { spawnSync } from "node:child_process";

const REQUIRED_ENVIRONMENTS = [
  {
    name: "staging",
    requireReviewers: false,
    docs: "docs/deployment.md § Staging secrets (INF-2)",
  },
  {
    name: "production",
    requireReviewers: true,
    docs: "docs/deployment.md § Production secrets (INF-3)",
  },
] as const;

type EnvironmentSummary = {
  name: string;
  protection_rules?: Array<{
    type?: string;
    reviewers?: unknown[];
  }>;
};

function resolveRepoSlug(): string {
  const arg = process.argv[2];
  if (arg?.includes("/")) return arg;

  const remote = spawnSync("git", ["remote", "get-url", "origin"], {
    encoding: "utf8",
  });
  if (remote.status !== 0 || !remote.stdout.trim()) {
    console.error("deploy-env: could not resolve owner/repo (pass as argv[2])");
    process.exit(2);
  }
  const match = remote.stdout.trim().match(/github\.com[:/](.+?)(?:\.git)?$/);
  if (!match?.[1]) {
    console.error("deploy-env: origin is not a github.com remote");
    process.exit(2);
  }
  return match[1];
}

function ghApi(path: string): EnvironmentSummary | null {
  const result = spawnSync("gh", ["api", path, "-H", "Accept: application/vnd.github+json"], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || "").trim();
    if (err.includes("404") || err.includes("Not Found")) {
      return null;
    }
    console.error(`deploy-env: gh api failed: ${err}`);
    process.exit(2);
  }
  return JSON.parse(result.stdout) as EnvironmentSummary;
}

function hasRequiredReviewers(env: EnvironmentSummary): boolean {
  return (env.protection_rules ?? []).some(
    (rule) => rule.type === "required_reviewers" && (rule.reviewers?.length ?? 0) > 0
  );
}

const repo = resolveRepoSlug();
const failures: string[] = [];

for (const required of REQUIRED_ENVIRONMENTS) {
  const env = ghApi(`repos/${repo}/environments/${required.name}`);
  if (!env) {
    failures.push(
      `missing environment "${required.name}" — create it in Settings → Environments (${required.docs})`
    );
    continue;
  }

  if (required.requireReviewers && !hasRequiredReviewers(env)) {
    failures.push(
      `environment "${required.name}" exists but has no required reviewers — add reviewers before first production deploy (${required.docs})`
    );
  } else {
    console.info(`deploy-env: OK — environment "${required.name}" present`);
  }
}

if (failures.length > 0) {
  console.error(`deploy-env: FAIL — OPS-ENV-1 incomplete on ${repo}:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(
    "After creating environments, configure STAGING_SSH_* / PRODUCTION_SSH_* secrets, METRICS_AUTH_TOKEN, and public STAGING_*/PRODUCTION_*_URL variables (see docs/deployment.md)."
  );
  process.exit(1);
}

console.info(
  `deploy-env: OK — ${repo} has required staging + production environments (OPS-ENV-1 structure). Verify secrets/variables separately before deploy.`
);

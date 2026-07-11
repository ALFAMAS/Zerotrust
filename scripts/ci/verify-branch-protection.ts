#!/usr/bin/env bun
/**
 * Verify GitHub branch protection on `main` includes the CI status checks from
 * `.github/workflows/ci.yml`. Operator gate — run locally or in a scheduled
 * workflow once branch protection is expected to be enabled.
 *
 * Usage: bun scripts/ci/verify-branch-protection.ts [owner/repo]
 * Requires: `gh` CLI authenticated with `repo` scope.
 */

import { spawnSync } from "node:child_process";

const REQUIRED_CHECKS = [
  "Lint & Type Check",
  "Tests",
  "Docker image smoke test",
  "SAST & Dependency Scans",
  "Build UI",
  "Lighthouse CI gate",
  "Playwright E2E & Accessibility Smoke",
  "Load & Chaos Tests",
] as const;

function resolveRepoSlug(): string {
  const arg = process.argv[2];
  if (arg?.includes("/")) return arg;

  const remote = spawnSync("git", ["remote", "get-url", "origin"], {
    encoding: "utf8",
  });
  if (remote.status !== 0 || !remote.stdout.trim()) {
    console.error("branch-protection: could not resolve owner/repo (pass as argv[2])");
    process.exit(2);
  }
  const match = remote.stdout.trim().match(/github\.com[:/](.+?)(?:\.git)?$/);
  if (!match?.[1]) {
    console.error("branch-protection: origin is not a github.com remote");
    process.exit(2);
  }
  return match[1];
}

function ghApi(path: string): unknown {
  const result = spawnSync("gh", ["api", path, "-H", "Accept: application/vnd.github+json"], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || "").trim();
    if (err.includes("404") || err.includes("Branch not protected")) {
      return null;
    }
    console.error(`branch-protection: gh api failed: ${err}`);
    process.exit(2);
  }
  return JSON.parse(result.stdout) as unknown;
}

const repo = resolveRepoSlug();
const protection = ghApi(`repos/${repo}/branches/main/protection`) as {
  required_status_checks?: { contexts?: string[]; checks?: { context: string }[] };
} | null;

if (!protection) {
  console.error(`branch-protection: FAIL — ${repo}@main is not protected`);
  process.exit(1);
}

const contexts =
  protection.required_status_checks?.contexts ??
  protection.required_status_checks?.checks?.map((c) => c.context) ??
  [];

const missing = REQUIRED_CHECKS.filter((name) => !contexts.includes(name));
if (missing.length > 0) {
  console.error(`branch-protection: FAIL — missing required checks on ${repo}@main:`);
  for (const name of missing) console.error(`  - ${name}`);
  process.exit(1);
}

console.info(
  `branch-protection: OK — ${repo}@main requires all ${REQUIRED_CHECKS.length} CI checks`
);

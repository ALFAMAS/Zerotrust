#!/usr/bin/env bun
/**
 * Create the first platform admin and default organization.
 *
 * Usage: bun run bootstrap:admin
 *
 * Env: DATABASE_URL (required), TOKEN_SECRET_HEX, CSFLE_MASTER_KEY_HEX,
 *      ADMIN_EMAIL, ADMIN_PASSWORD (or prompted interactively),
 *      optional ADMIN_DISPLAY_NAME, BOOTSTRAP_ORG_NAME, BOOTSTRAP_ORG_SLUG
 */
import "dotenv/config";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { closeDatabase, initializeDatabase } from "../src/db";
import { bootstrapAdmin } from "../src/services/bootstrap/bootstrapAdmin.service";

async function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = input;
    const stdout = output;
    stdout.write(question);

    if (!stdin.isTTY || typeof stdin.setRawMode !== "function") {
      const rl = createInterface({ input: stdin, output: stdout });
      rl.question("", (answer) => {
        rl.close();
        resolve(answer);
      });
      return;
    }

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let password = "";
    const onData = (chunk: string) => {
      const ch = chunk;

      if (ch === "\n" || ch === "\r" || ch === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        stdout.write("\n");
        resolve(password);
        return;
      }

      if (ch === "\u0003") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        reject(new Error("Cancelled"));
        return;
      }

      if (ch === "\u007f" || ch === "\b") {
        password = password.slice(0, -1);
        return;
      }

      password += ch;
    };

    stdin.on("data", onData);
  });
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`✗ ${name} is required (set it in .env or your shell)`);
    process.exit(1);
  }
  return value;
}

async function resolvePassword(): Promise<string> {
  const fromEnv = process.env.ADMIN_PASSWORD?.trim();
  if (fromEnv) return fromEnv;

  const password = await promptHidden("Admin password: ");
  if (!password) {
    console.error("✗ ADMIN_PASSWORD is required when not provided interactively");
    process.exit(1);
  }

  const confirm = await promptHidden("Confirm password: ");
  if (password !== confirm) {
    console.error("✗ Passwords do not match");
    process.exit(1);
  }
  return password;
}

await initializeDatabase();
try {
  const email = requireEnv("ADMIN_EMAIL");
  const password = await resolvePassword();

  const result = await bootstrapAdmin({
    email,
    password,
    displayName: process.env.ADMIN_DISPLAY_NAME?.trim() || undefined,
    orgName: process.env.BOOTSTRAP_ORG_NAME?.trim() || undefined,
    orgSlug: process.env.BOOTSTRAP_ORG_SLUG?.trim() || undefined,
  });

  if (!result.ok) {
    if (result.reason === "admin_exists") {
      console.error(
        `✗ An admin already exists (${result.existingAdminEmail}). ` +
          "Bootstrap is a one-time step — log in with that account or revoke the role before re-running."
      );
      process.exit(1);
    }
    console.error(`✗ ${result.message}`);
    process.exit(1);
  }

  if (result.status === "already_exists") {
    console.info(`○ Admin already bootstrapped for ${result.email} (userId=${result.userId})`);
    process.exit(0);
  }

  const verb = result.status === "created" ? "Created" : "Promoted";
  console.info(
    `✓ ${verb} admin ${result.email} (userId=${result.userId}, orgId=${result.orgId}). ` +
      "Log in at /login — the admin panel is at /admin."
  );
} catch (err) {
  console.error("✗ Bootstrap failed:", err instanceof Error ? err.message : String(err));
  process.exit(1);
} finally {
  await closeDatabase();
}

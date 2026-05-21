import fs from "fs-extra";
import path from "path";
import { generateAllKeys, generateHexKey } from "../utils/crypto";
import { printSuccess, printSection, printInfo, redactSecret } from "../utils/display";

interface GenerateKeysOptions {
  write?: boolean;
  file?: string;
}

export async function runGenerateKeys(opts: GenerateKeysOptions): Promise<void> {
  const { default: chalk } = await import("chalk");

  printSection("Generated Keys");

  const keys = generateAllKeys();

  console.log();
  console.log(`  ${chalk.dim("TOKEN_SECRET_HEX")}     = ${chalk.green(keys.TOKEN_SECRET_HEX)}`);
  console.log(`  ${chalk.dim("CSFLE_MASTER_KEY_HEX")} = ${chalk.green(keys.CSFLE_MASTER_KEY_HEX)}`);
  console.log(`  ${chalk.dim("SSF_SIGNING_SECRET")}   = ${chalk.green(keys.SSF_SIGNING_SECRET)}`);
  console.log();

  console.log(
    chalk.yellow(
      "  ⚠  Store these values securely. They cannot be recovered if lost.\n" +
        "     Losing TOKEN_SECRET_HEX invalidates all existing sessions.\n" +
        "     Losing CSFLE_MASTER_KEY_HEX makes encrypted fields unreadable."
    )
  );

  if (opts.write) {
    const envFile = path.resolve(process.cwd(), opts.file || ".env");

    let existing = "";
    if (await fs.pathExists(envFile)) {
      existing = await fs.readFile(envFile, "utf-8");
    }

    const updated = upsertEnvVar(
      upsertEnvVar(
        upsertEnvVar(existing, "TOKEN_SECRET_HEX", keys.TOKEN_SECRET_HEX),
        "CSFLE_MASTER_KEY_HEX",
        keys.CSFLE_MASTER_KEY_HEX
      ),
      "SSF_SIGNING_SECRET",
      keys.SSF_SIGNING_SECRET
    );

    await fs.writeFile(envFile, updated, "utf-8");
    printSuccess(`Keys written to ${envFile}`);
  } else {
    printInfo("Run with --write to save keys to your .env file");
  }
}

function upsertEnvVar(content: string, key: string, value: string): string {
  const regex = new RegExp(`^${key}=.*`, "m");
  const line = `${key}=${value}`;
  if (regex.test(content)) {
    return content.replace(regex, line);
  }
  return content.trimEnd() + `\n${line}\n`;
}

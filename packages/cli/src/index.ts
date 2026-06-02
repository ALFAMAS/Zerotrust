#!/usr/bin/env node
import { Command } from "commander";
import { printBanner } from "./utils/display";
import { runInit } from "./commands/init";
import { runGenerateKeys } from "./commands/generate-keys";
import { runDoctor } from "./commands/doctor";

const program = new Command();

program
  .name("zeroauth")
  .description("ZeroAuth CLI — scaffold and manage your ZeroAuth deployment")
  .version("1.0.0");

program
  .command("init [dir]")
  .description("Initialize a new ZeroAuth project in [dir] (defaults to current directory)")
  .option("-y, --yes", "Skip interactive prompts and use defaults")
  .option("--no-docker", "Skip Docker Compose setup")
  .action(async (dir: string | undefined, opts) => {
    printBanner();
    await runInit(dir || ".", opts);
  });

program
  .command("keys:generate")
  .alias("keys")
  .description("Generate new cryptographic keys for TOKEN_SECRET_HEX and CSFLE_MASTER_KEY_HEX")
  .option("-w, --write", "Write generated keys to .env file")
  .option("-f, --file <path>", "Path to .env file", ".env")
  .action(async (opts) => {
    await runGenerateKeys(opts);
  });

program
  .command("doctor")
  .description("Check your ZeroAuth configuration and service connectivity")
  .option("-f, --file <path>", "Path to .env file", ".env")
  .action(async (opts) => {
    await runDoctor(opts);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

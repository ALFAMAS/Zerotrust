import path from "path";
import fs from "fs-extra";
import { generateAllKeys } from "../utils/crypto";
import { buildEnvContent } from "../templates/env.template";
import { dockerComposeTemplate } from "../templates/docker-compose.template";
import { printSuccess, printError, printInfo, printSection, printNextSteps } from "../utils/display";

interface InitOptions {
  yes?: boolean;
  docker?: boolean;
}

export async function runInit(dir: string, opts: InitOptions): Promise<void> {
  const targetDir = path.resolve(process.cwd(), dir);

  printSection("Project Setup");
  printInfo(`Target directory: ${targetDir}`);

  // Dynamic import to avoid bundling issues
  const { default: inquirer } = await import("inquirer");
  const { default: ora } = await import("ora");

  // ── Gather preferences ──────────────────────────────────────────────────────
  let answers: {
    projectName: string;
    port: number;
    oauthProviders: string[];
    mfaChannels: string[];
    useDocker: boolean;
    overwrite: boolean;
  };

  if (opts.yes) {
    answers = {
      projectName: path.basename(targetDir),
      port: 3000,
      oauthProviders: [],
      mfaChannels: ["email"],
      useDocker: opts.docker !== false,
      overwrite: true,
    };
  } else {
    answers = await inquirer.prompt([
      {
        type: "input",
        name: "projectName",
        message: "Project name:",
        default: path.basename(targetDir),
        validate: (v: string) => v.trim().length > 0 || "Name cannot be empty",
      },
      {
        type: "number",
        name: "port",
        message: "Server port:",
        default: 3000,
      },
      {
        type: "checkbox",
        name: "oauthProviders",
        message: "Enable OAuth providers: (space to toggle)",
        choices: [
          { name: "Google", value: "google" },
          { name: "GitHub", value: "github" },
          { name: "Facebook", value: "facebook" },
          { name: "Apple", value: "apple" },
        ],
      },
      {
        type: "checkbox",
        name: "mfaChannels",
        message: "Enable MFA channels:",
        choices: [
          { name: "Email OTP", value: "email", checked: true },
          { name: "SMS (Twilio)", value: "sms" },
          { name: "WhatsApp (Twilio)", value: "whatsapp" },
          { name: "Telegram Bot", value: "telegram" },
        ],
      },
      {
        type: "confirm",
        name: "useDocker",
        message: "Generate docker-compose.yml?",
        default: opts.docker !== false,
      },
      {
        type: "confirm",
        name: "overwrite",
        message: "Overwrite existing files if present?",
        default: false,
        when: () => fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0,
      },
    ]);
  }

  // ── Create directory ─────────────────────────────────────────────────────────
  const spinner = ora("Creating project structure...").start();
  try {
    await fs.ensureDir(targetDir);
    spinner.succeed("Directory ready");
  } catch (err) {
    spinner.fail("Failed to create directory");
    printError((err as Error).message);
    process.exit(1);
  }

  // ── Generate keys ────────────────────────────────────────────────────────────
  const keysSpinner = ora("Generating cryptographic keys...").start();
  const keys = generateAllKeys();
  keysSpinner.succeed("Keys generated");

  // ── Write .env ───────────────────────────────────────────────────────────────
  const envPath = path.join(targetDir, ".env");
  const envContent = buildEnvContent({
    projectName: answers.projectName,
    port: answers.port,
    tokenSecretHex: keys.TOKEN_SECRET_HEX,
    csfleKeyHex: keys.CSFLE_MASTER_KEY_HEX,
    ssfSigningSecret: keys.SSF_SIGNING_SECRET,
    enableGoogle: answers.oauthProviders.includes("google"),
    enableGitHub: answers.oauthProviders.includes("github"),
    enableFacebook: answers.oauthProviders.includes("facebook"),
    enableApple: answers.oauthProviders.includes("apple"),
    enableEmailMfa: answers.mfaChannels.includes("email"),
    enableSmsMfa: answers.mfaChannels.includes("sms"),
    enableWhatsAppMfa: answers.mfaChannels.includes("whatsapp"),
    enableTelegramMfa: answers.mfaChannels.includes("telegram"),
    useDocker: answers.useDocker,
  });

  const envExists = fs.existsSync(envPath);
  if (!envExists || answers.overwrite) {
    await fs.writeFile(envPath, envContent, "utf-8");
    printSuccess(`${envExists ? "Updated" : "Created"} .env`);
  } else {
    printInfo(".env already exists — skipped (use --yes to overwrite)");
  }

  // Write .env.example (always)
  await fs.writeFile(path.join(targetDir, ".env.example"), envContent.replace(/=.+/g, "="), "utf-8");
  printSuccess("Created .env.example");

  // ── Docker Compose ───────────────────────────────────────────────────────────
  if (answers.useDocker) {
    const composePath = path.join(targetDir, "docker-compose.yml");
    if (!fs.existsSync(composePath) || answers.overwrite) {
      await fs.writeFile(composePath, dockerComposeTemplate(answers.projectName), "utf-8");
      printSuccess("Created docker-compose.yml");
    } else {
      printInfo("docker-compose.yml already exists — skipped");
    }
  }

  printNextSteps(dir);
}

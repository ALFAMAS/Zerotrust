import chalk from "chalk";
import path from "path";

const BANNER = `
 ______              _____         _   _
|___  /             /  _  \\       | | | |
   / /  ___ _ __ __|/ /_\\ \\ _   _| |_| |__
  / /  / _ \\ '__/ _ \\  _  || | | | __| '_ \\
./ /__| (_) | | | (_) | | | | |_| | |_| | | |
\\_____/\\___/|_|  \\___/\\_| |_/\\__,_|\\__|_| |_|

`;

/**
 * Print the ZeroAuth ASCII banner with version info.
 */
export function printBanner(): void {
  console.log(chalk.cyan.bold(BANNER));
  console.log(chalk.dim("  Zero-Trust Authentication Platform"));
  console.log(chalk.dim("  https://github.com/zeroauth-dev/zeroauth\n"));
}

/**
 * Print a styled success message.
 */
export function printSuccess(message: string): void {
  console.log(`\n${chalk.green.bold("  ✓")} ${chalk.green(message)}`);
}

/**
 * Print a styled error message.
 */
export function printError(message: string, hint?: string): void {
  console.error(`\n${chalk.red.bold("  ✗")} ${chalk.red(message)}`);
  if (hint) {
    console.error(`    ${chalk.dim(hint)}`);
  }
}

/**
 * Print a styled warning message.
 */
export function printWarning(message: string): void {
  console.warn(`\n${chalk.yellow.bold("  ⚠")} ${chalk.yellow(message)}`);
}

/**
 * Print an info line.
 */
export function printInfo(message: string): void {
  console.log(`  ${chalk.blue("→")} ${message}`);
}

/**
 * Print a section header.
 */
export function printSection(title: string): void {
  console.log(`\n${chalk.bold.underline(title)}`);
}

/**
 * Print the "next steps" guide after a successful init.
 */
export function printNextSteps(projectDir: string): void {
  const absDir = path.resolve(projectDir);
  const isCurrentDir = absDir === process.cwd();
  const cdStep = isCurrentDir ? "" : `\n  ${chalk.cyan("cd")} ${chalk.white(projectDir)}`;

  console.log(`
${chalk.bold.green("  ╔══════════════════════════════════════════════╗")}
${chalk.bold.green("  ║")}  ${chalk.bold.white("ZeroAuth initialized successfully!")}          ${chalk.bold.green("║")}
${chalk.bold.green("  ╚══════════════════════════════════════════════╝")}

${chalk.bold("  Next Steps:")}
  ─────────────────────────────────────────────
${cdStep}
  ${chalk.dim("1.")} ${chalk.cyan("Review your")} ${chalk.white(".env")} ${chalk.cyan("file and fill in provider credentials:")}
     ${chalk.dim("• OAuth client IDs and secrets")}
     ${chalk.dim("• SMTP / Twilio / Telegram credentials for MFA")}
     ${chalk.dim("• Admin email and password hash")}

  ${chalk.dim("2.")} ${chalk.cyan("Start the infrastructure with Docker Compose:")}
     ${chalk.white("docker compose up -d mongodb redis elasticsearch")}

  ${chalk.dim("3.")} ${chalk.cyan("Run the ZeroAuth server:")}
     ${chalk.white("docker compose up zeroauth")}
     ${chalk.dim("— or for local development —")}
     ${chalk.white("npm run dev")}

  ${chalk.dim("4.")} ${chalk.cyan("Verify your setup:")}
     ${chalk.white("npx zeroauth doctor")}
     ${chalk.white("curl http://localhost:3000/health")}

  ${chalk.dim("5.")} ${chalk.cyan("Open the audit dashboard (Kibana):")}
     ${chalk.white("http://localhost:5601")}

  ─────────────────────────────────────────────
  ${chalk.dim("Docs:")} ${chalk.underline("https://docs.zeroauth.dev")}
  ${chalk.dim("Issues:")} ${chalk.underline("https://github.com/zeroauth-dev/zeroauth/issues")}
`);
}

/**
 * Render a key=value pair for display (redacts long hex secrets).
 */
export function redactSecret(value: string): string {
  if (/^[0-9a-f]{32,}$/i.test(value)) {
    return value.slice(0, 8) + "..." + value.slice(-4);
  }
  return value;
}

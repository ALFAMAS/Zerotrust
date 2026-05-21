import fs from "fs-extra";
import path from "path";
import { execSync } from "child_process";
import { printSection, printSuccess, printError, printWarning, printInfo } from "../utils/display";

interface DoctorOptions {
  file?: string;
}

const REQUIRED_ENV_VARS = [
  "MONGO_URI",
  "TOKEN_SECRET_HEX",
  "CSFLE_MASTER_KEY_HEX",
];

const RECOMMENDED_ENV_VARS = [
  "REDIS_URI",
  "ELASTICSEARCH_HOST",
  "SMTP_HOST",
  "PORT",
];

export async function runDoctor(opts: DoctorOptions): Promise<void> {
  const { default: chalk } = await import("chalk");
  let allOk = true;

  // ── Node.js version ───────────────────────────────────────────────────────
  printSection("Runtime");
  const nodeVersion = process.version;
  const major = parseInt(nodeVersion.replace("v", "").split(".")[0]);
  if (major >= 18) {
    printSuccess(`Node.js ${nodeVersion} (>= 18 required)`);
  } else {
    printError(`Node.js ${nodeVersion} — upgrade to v18 or later`);
    allOk = false;
  }

  // ── Docker ────────────────────────────────────────────────────────────────
  printSection("Docker");
  try {
    const dockerVersion = execSync("docker --version 2>/dev/null", { timeout: 3000 })
      .toString()
      .trim();
    printSuccess(dockerVersion);

    const dockerComposeVersion = execSync("docker compose version 2>/dev/null || docker-compose --version 2>/dev/null", { timeout: 3000 })
      .toString()
      .trim();
    printSuccess(dockerComposeVersion);
  } catch {
    printWarning("Docker not found — required for the full infrastructure stack");
  }

  // ── .env file ─────────────────────────────────────────────────────────────
  printSection("Configuration");
  const envFile = path.resolve(process.cwd(), opts.file || ".env");

  if (!(await fs.pathExists(envFile))) {
    printError(`.env not found at ${envFile}`, "Run: npx zeroauth init");
    allOk = false;
  } else {
    printSuccess(`.env found at ${envFile}`);

    // Load env vars
    const content = await fs.readFile(envFile, "utf-8");
    const vars = parseEnvFile(content);

    for (const key of REQUIRED_ENV_VARS) {
      const val = vars[key] || process.env[key];
      if (!val) {
        printError(`${key} is not set (required)`);
        allOk = false;
      } else if (key.endsWith("_HEX") && val.length < 64) {
        printError(`${key} is too short — must be 64+ hex chars (32+ bytes)`);
        allOk = false;
      } else {
        printSuccess(`${key} is set`);
      }
    }

    for (const key of RECOMMENDED_ENV_VARS) {
      const val = vars[key] || process.env[key];
      if (!val) {
        printWarning(`${key} is not set (recommended)`);
      } else {
        printInfo(`${key} is set`);
      }
    }
  }

  // ── Connectivity ──────────────────────────────────────────────────────────
  printSection("Service Connectivity");

  const mongoUri = process.env.MONGO_URI || "mongodb://localhost:27017/zeroauth";
  await checkTcpConnectivity("MongoDB", mongoUri);

  const redisUri = process.env.REDIS_URI;
  if (redisUri) {
    await checkTcpConnectivity("Redis", redisUri);
  } else {
    printInfo("Redis — not configured (rate limiting will use in-memory fallback)");
  }

  const esHost = process.env.ELASTICSEARCH_HOST;
  if (esHost) {
    await checkHttpConnectivity(
      "Elasticsearch",
      `http://${esHost}:${process.env.ELASTICSEARCH_PORT || 9200}/_cluster/health`
    );
  } else {
    printInfo("Elasticsearch — not configured (audit pipeline disabled)");
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log();
  if (allOk) {
    printSuccess("All checks passed — ZeroAuth is ready to run!");
  } else {
    printError("Some checks failed — review the issues above before starting ZeroAuth");
    process.exit(1);
  }
}

function parseEnvFile(content: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    vars[key] = val;
  }
  return vars;
}

async function checkTcpConnectivity(label: string, uri: string): Promise<void> {
  try {
    const { hostname, port } = new URL(uri.startsWith("mongodb") ? uri.replace("mongodb", "http") : uri);
    const portNum = parseInt(port) || 27017;

    await new Promise<void>((resolve, reject) => {
      const net = require("net");
      const socket = new net.Socket();
      socket.setTimeout(3000);
      socket.connect(portNum, hostname, () => { socket.destroy(); resolve(); });
      socket.on("error", reject);
      socket.on("timeout", () => reject(new Error("timeout")));
    });

    printSuccess(`${label} — connected`);
  } catch {
    printError(`${label} — connection failed`);
  }
}

async function checkHttpConnectivity(label: string, url: string): Promise<void> {
  try {
    const http = require("http");
    await new Promise<void>((resolve, reject) => {
      const req = http.get(url, { timeout: 3000 }, (res: any) => {
        resolve();
        res.resume();
      });
      req.on("error", reject);
      req.on("timeout", () => reject(new Error("timeout")));
    });
    printSuccess(`${label} — reachable`);
  } catch {
    printError(`${label} — not reachable at ${url}`);
  }
}

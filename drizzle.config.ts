import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // Never hardcode a connection string here (CWE-798) — a real Neon
    // credential previously committed as the fallback had to be rotated.
    url: process.env.DATABASE_URL || "postgresql://localhost:5432/zerotrust",
  },
} satisfies Config;

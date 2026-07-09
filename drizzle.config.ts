import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      "postgresql://neon_owner:3J6RcaLXeGwO@ep-noisy-hill-a1hjd9xk-pooler.ap-southeast-1.aws.neon.tech/neon?sslmode=require&channel_binding=require",
  },
} satisfies Config;

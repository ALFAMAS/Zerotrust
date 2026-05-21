import "dotenv/config";
import { createServer } from "./api/server";
import { shutdownZeroAuth } from ".";

const PORT = process.env.PORT || 3000;

async function main() {
  const app = await createServer();

  const server = app.listen(PORT, () => {
    console.log(`[API] Server listening on http://localhost:${PORT}`);
    console.log(`[API] Health:  http://localhost:${PORT}/healthz`);
    console.log(`[API] Docs:    http://localhost:${PORT}/docs`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[API] Received ${signal}, shutting down…`);
    server.close(async () => {
      await shutdownZeroAuth();
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[API] Fatal startup error:", err);
  process.exit(1);
});

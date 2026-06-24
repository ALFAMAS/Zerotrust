import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { getDb } from "../../db";
import { usersTable } from "../../db/schema";
import { getLogger } from "../../logger";
import { verifyUnsubscribeToken } from "../../services/unsubscribe";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("unsubscribe-routes");

const APP_NAME = process.env.APP_NAME ?? "zerotrust";
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

function successPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribed — ${APP_NAME}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#f1f5f9;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}
    .card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:48px 40px;max-width:480px;width:100%;text-align:center}
    h1{font-size:22px;font-weight:700;margin-bottom:12px;color:#f8fafc}
    p{font-size:15px;color:#94a3b8;line-height:1.6;margin-bottom:24px}
    a{display:inline-block;padding:10px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-size:14px;font-weight:600}
    a:hover{background:#4f46e5}
  </style>
</head>
<body>
  <div class="card">
    <h1>You've been unsubscribed</h1>
    <p>${message}</p>
    <a href="${APP_URL}/dashboard/account">Manage email preferences</a>
  </div>
</body>
</html>`;
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invalid link — ${APP_NAME}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f172a;color:#f1f5f9;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px}
    .card{background:#1e293b;border:1px solid #7f1d1d;border-radius:12px;padding:48px 40px;max-width:480px;width:100%;text-align:center}
    h1{font-size:22px;font-weight:700;margin-bottom:12px;color:#fca5a5}
    p{font-size:15px;color:#94a3b8;line-height:1.6}
  </style>
</head>
<body>
  <div class="card">
    <h1>Invalid or expired link</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

// GET /auth/unsubscribe?token=...
router.get("/unsubscribe", async (c) => {
  const token = c.req.query("token");
  if (!token) {
    return c.html(errorPage("Missing unsubscribe token."), 400);
  }

  const data = verifyUnsubscribeToken(token);
  if (!data) {
    return c.html(
      errorPage("This unsubscribe link is invalid or has expired."),
      400,
    );
  }

  try {
    const db = getDb();
    const [user] = await db
      .select({ id: usersTable.id, metadata: usersTable.metadata })
      .from(usersTable)
      .where(eq(usersTable.id, data.userId))
      .limit(1);

    if (!user) {
      return c.html(errorPage("Account not found."), 404);
    }

    const meta = (user.metadata as Record<string, unknown>) ?? {};
    const prefs =
      (meta.notificationPreferences as Record<string, unknown>) ?? {};

    let updatedPrefs: Record<string, unknown>;
    let message: string;

    if (data.emailType === "all") {
      updatedPrefs = { ...prefs, emailFallback: false };
      message = "You will no longer receive any email notifications from us.";
    } else if (data.emailType === "notification") {
      updatedPrefs = { ...prefs, emailFallback: false };
      message = "You will no longer receive notification digest emails.";
    } else {
      updatedPrefs = { ...prefs, [`${data.emailType}Emails`]: false };
      message = `You have been unsubscribed from ${data.emailType} emails.`;
    }

    await db
      .update(usersTable)
      .set({
        metadata: { ...meta, notificationPreferences: updatedPrefs },
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, user.id));

    logger.info("User unsubscribed", {
      userId: user.id,
      emailType: data.emailType,
    });
    return c.html(successPage(message));
  } catch (err) {
    logger.error("Unsubscribe error", err as Error);
    return c.html(errorPage("An error occurred. Please try again later."), 500);
  }
});

export default router;

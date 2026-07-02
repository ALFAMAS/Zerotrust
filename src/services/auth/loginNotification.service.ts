/**
 * New-device login notification.
 * After a successful login, checks whether the device fingerprint has been
 * seen on a previous session for this user. If not, sends a security alert
 * email with a one-click "secure my account" link that revokes the session.
 */

import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../../db/index";
import { sessionsTable } from "../../db/schema";
import { getLogger } from "../../logger/index";
import { sendSecurityAlertEmail } from "./email.service";

const logger = getLogger("login-notification");

export function isLoginNotificationEnabled(): boolean {
  return process.env.LOGIN_NOTIFICATION_ENABLED !== "false";
}

interface NotifyParams {
  userId: string;
  email: string;
  displayName: string;
  sessionId: string;
  fingerprintHash: string;
  ipAddress?: string;
  country?: string;
  userAgent?: string;
}

/**
 * Fire-and-forget: never throws, never blocks the login response.
 * Returns true when an alert email was dispatched (useful in tests).
 */
export async function notifyIfNewDevice(params: NotifyParams): Promise<boolean> {
  if (!isLoginNotificationEnabled()) return false;

  try {
    const db = getDb();

    // Any previous session (other than the one just created) with the same
    // fingerprint hash means this device is already known.
    const previous = await db
      .select({ id: sessionsTable.id, deviceFingerprint: sessionsTable.deviceFingerprint })
      .from(sessionsTable)
      .where(and(eq(sessionsTable.userId, params.userId), ne(sessionsTable.id, params.sessionId)));

    const known = previous.some((s) => {
      const fp = s.deviceFingerprint as { hash?: string } | null;
      return fp?.hash === params.fingerprintHash;
    });
    if (known) return false;

    // First session ever (fresh signup) — skip the alert to avoid noise.
    if (previous.length === 0) return false;

    const appUrl = process.env.APP_URL ?? "http://localhost:3000";
    const revokeSessionUrl = `${appUrl}/dashboard/sessions?revoke=${encodeURIComponent(params.sessionId)}`;

    await sendSecurityAlertEmail(params.email, {
      name: params.displayName || params.email,
      action: "New device sign-in",
      device: params.userAgent || "Unknown device",
      location: [params.ipAddress, params.country].filter(Boolean).join(" · ") || "Unknown",
      time: new Date().toUTCString(),
      revokeSessionUrl,
    });

    logger.info("New-device login alert sent", { userId: params.userId });
    return true;
  } catch (err) {
    logger.error("Failed to send new-device login alert", err as Error);
    return false;
  }
}

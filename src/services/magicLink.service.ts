import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../db";
import { otpsTable, usersTable } from "../db/schema";
import { getLogger } from "../logger";
import { getSettings } from "../models/settings.model";
import { hashTokenSha256 } from "../shared/cryptoHash";
import { sendMagicLinkEmail } from "./email.service";

const logger = getLogger("magic-link");

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;

function hashToken(token: string): string {
  return hashTokenSha256(token);
}

export async function sendMagicLink(
  email: string,
  redirectUrl?: string
): Promise<{ sent: boolean }> {
  try {
    const db = getDb();
    const userRows = await db
      .select({ id: usersTable.id, displayName: usersTable.displayName })
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()))
      .limit(1);

    if (userRows.length === 0) {
      logger.debug("Magic link requested for unknown email (silently ignored)", { email });
      return { sent: true };
    }

    const user = userRows[0];
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(rawToken);

    await db.insert(otpsTable).values({
      userId: user.id,
      code: tokenHash,
      type: "login",
      channel: "email",
      target: email,
      expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
    });

    const settings = await getSettings();
    const appUrl = settings.appUrl || process.env.APP_URL || "http://localhost:3000";
    const magicLinkUrl =
      `${appUrl}/magic-link/verify` +
      `?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(email)}` +
      (redirectUrl ? `&redirect=${encodeURIComponent(redirectUrl)}` : "");

    const name = user.displayName || email.split("@")[0];
    void sendMagicLinkEmail(email, { name, magicLinkUrl, expiresInMinutes: 15 });
    logger.info("Magic link email queued", { email });
  } catch (err) {
    logger.error("sendMagicLink error", err as Error);
  }
  return { sent: true };
}

export async function verifyMagicLink(
  email: string,
  token: string
): Promise<{ userId: string; userEmail: string } | null> {
  try {
    const tokenHash = hashToken(token);
    const db = getDb();
    const now = new Date();

    const records = await db
      .select()
      .from(otpsTable)
      .where(
        and(
          eq(otpsTable.target, email),
          eq(otpsTable.channel, "email"),
          eq(otpsTable.type, "login"),
          eq(otpsTable.code, tokenHash),
          gt(otpsTable.expiresAt, now)
        )
      )
      .limit(1);

    if (records.length === 0) {
      logger.warn("Magic link verification failed — record not found or expired", { email });
      return null;
    }

    const record = records[0];
    await db.delete(otpsTable).where(eq(otpsTable.id, record.id));

    const userRows = await db
      .select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, record.userId))
      .limit(1);
    if (userRows.length === 0) {
      logger.warn("Magic link user not found after record lookup", { userId: record.userId });
      return null;
    }

    return { userId: userRows[0].id, userEmail: userRows[0].email };
  } catch (err) {
    logger.error("verifyMagicLink error", err as Error);
    return null;
  }
}

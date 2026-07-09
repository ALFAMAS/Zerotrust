import * as nodeCrypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getConfig } from "../../../config";
import { generateNumericCode } from "../../../crypto/codes";
import { getDb } from "../../../db";
import { otpsTable, usersTable } from "../../../db/schema";
import { getLogger } from "../../../logger";
import { TokenService } from "../../../services/auth/token.service";
import { sendVerificationEmail } from "../../../services/notifications/email.service";
import { hashTokenSha256 } from "../../../shared/cryptoHash";
import { normalizeLocale } from "../../../shared/locale";
import { hashPassword, passwordNeedsRehash } from "../../../shared/passwordHash";

export const logger = getLogger("auth-routes");

let tokenServiceInstance: TokenService | null = null;
export async function getTokenService() {
  if (tokenServiceInstance) return tokenServiceInstance;
  const cfg = getConfig();
  tokenServiceInstance = new TokenService(cfg.security.tokenSecretHex, cfg.session);
  await tokenServiceInstance.init();
  return tokenServiceInstance;
}

export function hashToken(token: string) {
  return nodeCrypto.createHash("sha256").update(token).digest("hex");
}

export const MFA_CHALLENGE_AUD = "mfa";
export const MFA_CHALLENGE_SCOPE = "mfa:challenge";
export const MFA_CHALLENGE_TTL_SECS = 300;

export async function rehashPasswordIfLegacy(
  userId: string,
  password: string,
  storedHash: string
): Promise<void> {
  if (!passwordNeedsRehash(storedHash)) return;
  const db = getDb();
  const passwordHash = await hashPassword(password);
  await db
    .update(usersTable)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(usersTable.id, userId));
}

export function userRequiresMfa(user: { mfa?: unknown }): boolean {
  return (user.mfa as { totp?: { enabled?: boolean } } | undefined)?.totp?.enabled === true;
}

export async function issueMfaChallengeToken(user: { id: string; email: string }): Promise<string> {
  const tokenSvc = await getTokenService();
  return tokenSvc.signAccessToken(
    {
      sub: user.id,
      email: user.email,
      sid: "mfa-pending",
      aud: MFA_CHALLENGE_AUD,
      scope: [MFA_CHALLENGE_SCOPE],
    },
    MFA_CHALLENGE_TTL_SECS
  );
}

export async function verifyTotpCode(secret: string, code: string): Promise<boolean> {
  try {
    const { TOTP, Secret } = await import("otpauth");
    const totp = new TOTP({
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secret),
    });
    return totp.validate({ token: code, window: 1 }) !== null;
  } catch (err) {
    logger.error("TOTP verify error during login", err as Error);
    return false;
  }
}

const EMAIL_VERIFICATION_TTL_MIN = 30;

export async function issueVerification(user: {
  id: string;
  email: string;
  displayName?: string | null;
  locale?: string | null;
}) {
  const db = getDb();
  const code = generateNumericCode(6);
  await db
    .delete(otpsTable)
    .where(and(eq(otpsTable.userId, user.id), eq(otpsTable.type, "email_verification")));
  await db.insert(otpsTable).values({
    userId: user.id,
    code: hashTokenSha256(code),
    type: "email_verification",
    channel: "email",
    target: user.email,
    expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MIN * 60 * 1000),
  });
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const verifyUrl = `${appUrl}/verify-email?code=${code}`;
  void sendVerificationEmail(user.email, {
    name: user.displayName ?? user.email,
    code,
    verifyUrl,
    expiresInMinutes: EMAIL_VERIFICATION_TTL_MIN,
    locale: normalizeLocale(user.locale),
  });
}

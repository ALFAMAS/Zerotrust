import { createHmac, timingSafeEqual } from "crypto";

const SECRET = () => process.env.UNSUBSCRIBE_SECRET ?? "default-unsubscribe-secret-change-me";

const TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

export type UnsubscribeEmailType = "notification" | "security" | "marketing" | "all";

export function generateUnsubscribeToken(userId: string, emailType: UnsubscribeEmailType): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, emailType, expiresAt: Date.now() + TOKEN_TTL_MS })
  ).toString("base64url");
  const sig = createHmac("sha256", SECRET()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyUnsubscribeToken(
  token: string
): { userId: string; emailType: UnsubscribeEmailType } | null {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;

  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = createHmac("sha256", SECRET()).update(payload).digest("base64url");
  try {
    const expectedBuf = Buffer.from(expected, "utf8");
    const sigBuf = Buffer.from(sig, "utf8");
    if (expectedBuf.length !== sigBuf.length || !timingSafeEqual(expectedBuf, sigBuf)) return null;
  } catch {
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data.userId !== "string" || typeof data.emailType !== "string") return null;
    if (Date.now() > data.expiresAt) return null;
    return { userId: data.userId, emailType: data.emailType as UnsubscribeEmailType };
  } catch {
    return null;
  }
}

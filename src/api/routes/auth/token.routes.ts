import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { getConfig } from "../../../config";
import { getDb } from "../../../db";
import { refreshTokensTable, sessionsTable, usersTable } from "../../../db/schema";
import { revokeRefreshTokenFamily, revokeSessionAtLogout, rotateRefreshToken } from "../../../db/repositories/authSessions.repository";
import { optionalAuthMiddleware } from "../../../middleware/auth";
import { requireProofOfPossession } from "../../../middleware/proofOfPossession";
import { rateLimit } from "../../../middleware/rateLimiting";
import { clearRefreshTokenCookie, readRefreshTokenFromRequest, setRefreshTokenCookie } from "../../../shared/authCookies";
import { getClientIp } from "../../../shared/clientIp";
import { internalError } from "../../../shared/httpErrors";
import type { HonoEnv } from "../../../shared/types";
import { getTokenService, hashToken, logger } from "./_shared";

const router = new Hono<HonoEnv>();
// POST /token/refresh
router.post(
  "/token/refresh",
  rateLimit({ points: 20, windowSecs: 60 }),
  requireProofOfPossession(),
  async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const refreshToken = readRefreshTokenFromRequest(c, body.refreshToken);
      if (!refreshToken) {
        return c.json({ error: "INVALID_REQUEST", message: "refreshToken required" }, 400);
      }

      const tokenHash = hashToken(refreshToken);
      const db = getDb();

      const rtRows = await db
        .select()
        .from(refreshTokensTable)
        .where(eq(refreshTokensTable.tokenHash, tokenHash))
        .limit(1);
      const rt = rtRows[0];
      if (!rt || rt.expiresAt < new Date()) {
        return c.json({ error: "TOKEN_INVALID", message: "Invalid refresh token" }, 401);
      }

      // Refresh-token reuse detection: an already-rotated (revoked) token is
      // being presented again. This is the canonical signal of a stolen refresh
      // token — the legitimate client and the attacker each try to redeem it.
      // Fail closed for the whole account: revoke every refresh token and active
      // session so both parties are forced to re-authenticate.
      if (rt.isRevoked) {
        logger.warn("Refresh token reuse detected — revoking session family", {
          userId: rt.userId,
        });
        await revokeRefreshTokenFamily(rt.familyId, "refresh_token_reuse");
        return c.json(
          {
            error: "TOKEN_REUSE_DETECTED",
            message: "This session has been ended for your security. Please sign in again.",
          },
          401
        );
      }

      const cfg = getConfig();
      const tokenSvc = await getTokenService();

      const userRows = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, rt.userId))
        .limit(1);
      const user = userRows[0];
      if (!user) {
        return c.json({ error: "USER_NOT_FOUND", message: "User not found" }, 404);
      }

      const [oldSession] = await db
        .select({ activeOrgId: sessionsTable.activeOrgId })
        .from(sessionsTable)
        .where(eq(sessionsTable.id, rt.sessionId))
        .limit(1);

      const popKey = c.req.header("x-pop-key") || undefined;
      const newSessionId = crypto.randomUUID();

      const accessToken = await tokenSvc.signAccessToken({
        sub: user.id,
        email: user.email,
        sid: newSessionId,
        aud: "zerotrust",
        scope: ["openid"],
        pop_key: popKey,
      });
      const payload = await tokenSvc.verifyAccessToken(accessToken);
      const newRefreshPlain = await tokenSvc.signRefreshToken();
      const newRefreshHash = hashToken(newRefreshPlain);

      await rotateRefreshToken({
        oldRefreshTokenId: rt.id,
        session: {
          id: newSessionId,
          userId: user.id,
          tokenId: payload.jti,
          deviceFingerprint: {},
          ipAddress: getClientIp(c),
          userAgent: c.req.header("user-agent"),
          expiresAt: new Date(payload.exp * 1000),
          lastActivityAt: new Date(),
          isActive: true,
          activeOrgId: oldSession?.activeOrgId ?? null,
        },
        refreshToken: {
          userId: user.id,
          tokenHash: newRefreshHash,
          expiresAt: new Date(Date.now() + cfg.session.refreshTokenTTL * 1000),
          familyId: rt.familyId,
        },
      });

      setRefreshTokenCookie(c, newRefreshPlain, cfg.session.refreshTokenTTL);

      return c.json({
        accessToken,
        expiresIn: cfg.session.defaultTTL,
        tokenType: "Bearer",
      });
    } catch (err) {
      return internalError(c, logger, "Refresh token error", err, "Refresh failed");
    }
  }
);

// POST /logout — revoke server-side session + refresh token, then clear cookie (ADR 008)
router.post("/logout", optionalAuthMiddleware, async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const refreshToken = readRefreshTokenFromRequest(c, body.refreshToken);
    await revokeSessionAtLogout({
      sessionId: c.get("session")?.id,
      refreshTokenPlain: refreshToken,
    });
    clearRefreshTokenCookie(c);
    return c.json({ success: true });
  } catch (err) {
    return internalError(c, logger, "Logout error", err);
  }
});

export default router;

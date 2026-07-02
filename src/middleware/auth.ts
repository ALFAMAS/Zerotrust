import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { getConfig } from "../config";
import { getDb } from "../db";
import { sessionsTable, usersTable } from "../db/schema";
import { getLogger } from "../logger";
import {
  enforceConcurrentSessionCap,
  evaluateSessionPolicy,
  getEffectiveSessionPolicy,
} from "../services/auth/sessionPolicy.service";
import { TokenService } from "../services/auth/token.service";
import { cacheUserState, getUserCached } from "../services/auth/userStateCache.service";
import { describePrincipal, principalFromToken } from "../shared/principal";
import { isAdmin } from "../shared/roles";
import type {
  DeviceFingerprint,
  HonoEnv,
  OAuthProvider,
  Passkey,
  Session,
  TokenPayload,
  User,
} from "../shared/types";
import { ErrorCodes, zerotrustError } from "../shared/types";
import { revokeSession } from "./sessionControl";

const logger = getLogger("auth-middleware");
let tokenService: TokenService;

/**
 * Default minimum interval, in seconds, between `sessions.last_activity_at`
 * writes. Overridable with `SESSION_ACTIVITY_REFRESH_SECONDS`.
 */
const DEFAULT_ACTIVITY_REFRESH_SECONDS = 60;

/**
 * How long we may wait before persisting a fresh `last_activity_at`.
 *
 * Writing the activity timestamp on *every* authenticated request turns each
 * read into a write — doubling DB write volume on hot endpoints and adding the
 * round-trip straight to p95. Instead we refresh at most once per window.
 *
 * The window is also clamped to half of the org idle-timeout (when one is set)
 * so idle-session enforcement — which reads `last_activity_at` in
 * `evaluateSessionPolicy` — never drifts by more than half its budget.
 */
export function activityRefreshSeconds(idleTimeoutSeconds: number): number {
  const raw = Number(
    process.env.SESSION_ACTIVITY_REFRESH_SECONDS ?? DEFAULT_ACTIVITY_REFRESH_SECONDS
  );
  const base = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_ACTIVITY_REFRESH_SECONDS;
  if (idleTimeoutSeconds && idleTimeoutSeconds > 0) {
    return Math.max(1, Math.min(base, Math.floor(idleTimeoutSeconds / 2)));
  }
  return base;
}

/**
 * Decide whether a session's `last_activity_at` is stale enough to persist a
 * new value. Fails open (returns `true`) for a missing/invalid timestamp or a
 * non-positive interval so we never silently stop tracking activity.
 */
export function shouldRefreshActivity(
  lastActivityAt: Date | string | null | undefined,
  now: Date,
  intervalSeconds: number
): boolean {
  if (!lastActivityAt) return true;
  if (intervalSeconds <= 0) return true;
  const last = lastActivityAt instanceof Date ? lastActivityAt : new Date(lastActivityAt);
  if (Number.isNaN(last.getTime())) return true;
  return now.getTime() - last.getTime() >= intervalSeconds * 1000;
}

export async function initAuthMiddleware(): Promise<void> {
  const config = getConfig();
  tokenService = new TokenService(config.security.tokenSecretHex, config.session);
  await tokenService.init();
  logger.info("✓ Auth middleware initialized");
}

export const authMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  try {
    const authHeader = c.req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json(
        {
          error: ErrorCodes.TOKEN_INVALID,
          message: "Missing or malformed Authorization header",
        },
        401
      );
    }

    const token = authHeader.substring(7);

    let payload: TokenPayload;
    try {
      payload = await tokenService.verifyAccessToken(token);
    } catch (error) {
      if (error instanceof Error && error.message === "TOKEN_EXPIRED") {
        return c.json(
          {
            error: ErrorCodes.TOKEN_EXPIRED,
            message: "Access token has expired",
          },
          401
        );
      }
      return c.json(
        {
          error: ErrorCodes.TOKEN_INVALID,
          message: "Invalid or tampered token",
        },
        401
      );
    }

    const db = getDb();

    const cachedUser = await getUserCached(payload.sub);
    let session: typeof sessionsTable.$inferSelect;
    let userRow: typeof usersTable.$inferSelect;
    try {
      if (cachedUser) {
        const sessionRows = await db
          .select({ session: sessionsTable })
          .from(sessionsTable)
          .where(
            and(
              eq(sessionsTable.tokenId, payload.jti),
              eq(sessionsTable.userId, payload.sub),
              eq(sessionsTable.isActive, true)
            )
          )
          .limit(1);
        if (sessionRows.length === 0) {
          return c.json(
            {
              error: ErrorCodes.SESSION_NOT_FOUND,
              message: "Session not found or revoked",
            },
            401
          );
        }
        session = sessionRows[0].session;
        userRow = cachedUser;
      } else {
        const authRows = await db
          .select({ session: sessionsTable, user: usersTable })
          .from(sessionsTable)
          .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
          .where(
            and(
              eq(sessionsTable.tokenId, payload.jti),
              eq(sessionsTable.userId, payload.sub),
              eq(sessionsTable.isActive, true)
            )
          )
          .limit(1);
        if (authRows.length === 0) {
          return c.json(
            {
              error: ErrorCodes.SESSION_NOT_FOUND,
              message: "Session not found or revoked",
            },
            401
          );
        }
        ({ session, user: userRow } = authRows[0]);
        void cacheUserState(userRow);
      }
    } catch (dbErr) {
      logger.error("Auth middleware DB error", dbErr as Error);
      return c.json(
        { error: "SERVICE_UNAVAILABLE", message: "Database temporarily unavailable" },
        503
      );
    }

    if (session.expiresAt < new Date()) {
      await db
        .update(sessionsTable)
        .set({ isActive: false })
        .where(eq(sessionsTable.id, session.id));
      return c.json({ error: ErrorCodes.SESSION_EXPIRED, message: "Session has expired" }, 401);
    }

    if (session.revokedAt) {
      return c.json(
        {
          error: ErrorCodes.TOKEN_REVOKED,
          message: "Session has been revoked",
        },
        401
      );
    }

    // Enforce org-level session & device policy (strictest across the user's
    // orgs). The effective policy is cached, and only orgs that configured a
    // limit do any work here.
    const sessionPolicy = await getEffectiveSessionPolicy(session.userId);
    const policyDecision = evaluateSessionPolicy(session, sessionPolicy);
    if (!policyDecision.allowed) {
      await revokeSession(session.id, policyDecision.reason).catch(() => {});
      return c.json(
        {
          error: policyDecision.reason,
          message: "Session ended by your organization's security policy",
        },
        401
      );
    }
    if (sessionPolicy.maxConcurrentSessions > 0) {
      const currentRevoked = await enforceConcurrentSessionCap(
        session.userId,
        sessionPolicy.maxConcurrentSessions,
        session.id
      );
      if (currentRevoked) {
        return c.json(
          {
            error: "SESSION_CONCURRENT_LIMIT",
            message: "Session ended: concurrent-session limit reached",
          },
          401
        );
      }
    }

    if (userRow.status === "deleted") {
      return c.json(
        {
          error: ErrorCodes.USER_DELETED,
          message: "User account has been deleted",
        },
        401
      );
    }

    if (userRow.status === "suspended") {
      return c.json(
        {
          error: ErrorCodes.USER_SUSPENDED,
          message: "User account is suspended",
        },
        403
      );
    }

    // Set typed context variables. `userRow`/`session` come from a raw
    // Drizzle select on untyped jsonb columns, so these casts translate the
    // DB's storage shape into the canonical `User`/`Session` types everything
    // downstream relies on (see shared/types.ts).
    c.set("user", {
      id: userRow.id,
      email: userRow.email,
      username: userRow.username,
      passwordHash: userRow.passwordHash,
      phone: userRow.phone,
      displayName: userRow.displayName,
      avatarUrl: userRow.avatarUrl,
      roles: userRow.roles ?? [],
      attributes: (userRow.attributes as User["attributes"]) ?? {},
      mfa: (userRow.mfa as User["mfa"]) ?? {
        totp: { enabled: false, backupCodes: [] },
        webauthn: { enabled: false },
      },
      passkeys: (userRow.passkeys as Passkey[]) ?? [],
      oauthProviders: (userRow.oauthProviders as OAuthProvider[]) ?? [],
      status: userRow.status as User["status"],
      parentUserId: userRow.parentUserId,
      subUserIds: userRow.subUserIds ?? [],
      sessionConfig: (userRow.sessionConfig as User["sessionConfig"]) ?? {},
      lastLoginAt: userRow.lastLoginAt,
      metadata: userRow.metadata as Record<string, unknown> | null,
      createdAt: userRow.createdAt,
      updatedAt: userRow.updatedAt,
    });

    c.set("session", {
      id: session.id,
      userId: session.userId,
      tokenId: session.tokenId,
      deviceFingerprint: (session.deviceFingerprint as DeviceFingerprint) ?? {},
      ipAddress: session.ipAddress,
      country: session.country,
      userAgent: session.userAgent,
      expiresAt: session.expiresAt,
      lastActivityAt: session.lastActivityAt,
      isActive: session.isActive,
      revokedAt: session.revokedAt,
      revokedReason: session.revokedReason,
      proofOfPossessionKey: session.proofOfPossessionKey,
      continuousEvalResult: session.continuousEvalResult as Session["continuousEvalResult"],
      anomalyFlags: session.anomalyFlags as Session["anomalyFlags"],
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });

    c.set("token", payload);

    // Derive audit principal from token (agent/human + delegation chain)
    const auditPrincipal = principalFromToken(payload);
    c.set("auditPrincipal", auditPrincipal);

    // Refresh last activity — throttled. Skipping the write on hot sessions
    // keeps reads off the write path (see activityRefreshSeconds), while the
    // window stays below the org idle-timeout so policy enforcement is exact.
    const activityNow = new Date();
    if (
      shouldRefreshActivity(
        session.lastActivityAt,
        activityNow,
        activityRefreshSeconds(sessionPolicy.idleTimeoutSeconds)
      )
    ) {
      await db
        .update(sessionsTable)
        .set({ lastActivityAt: activityNow })
        .where(eq(sessionsTable.id, session.id));
    }

    logger.debug("✓ Token verified", {
      userId: payload.sub,
      sessionId: payload.sid,
      principal: describePrincipal(auditPrincipal),
    });
    return next();
  } catch (error) {
    if (error instanceof zerotrustError) {
      return c.json(
        { error: error.code, message: error.message },
        error.statusCode as ContentfulStatusCode
      );
    }
    logger.error("Auth middleware error", error as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Authentication failed" }, 500);
  }
});

/**
 * Require the authenticated principal to hold the `admin` role. Must run after
 * `authMiddleware` (it reads the user it sets). Use this to guard one-off admin
 * endpoints mounted directly on the app rather than through an admin router.
 */
export const requireAdmin = createMiddleware<HonoEnv>(async (c, next) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ error: ErrorCodes.TOKEN_INVALID, message: "Authentication required" }, 401);
  }
  if (!isAdmin(user)) {
    return c.json({ error: "FORBIDDEN", message: "Admin role required" }, 403);
  }
  return next();
});

export const optionalAuthMiddleware = createMiddleware<HonoEnv>(async (c, next) => {
  try {
    const authHeader = c.req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      await next();
      return;
    }

    const token = authHeader.substring(7);
    try {
      const payload = await tokenService.verifyAccessToken(token);
      const db = getDb();

      let sessionRows: (typeof sessionsTable.$inferSelect)[];
      try {
        sessionRows = await db
          .select()
          .from(sessionsTable)
          .where(
            and(
              eq(sessionsTable.tokenId, payload.jti),
              eq(sessionsTable.userId, payload.sub),
              eq(sessionsTable.isActive, true)
            )
          )
          .limit(1);
      } catch (dbErr) {
        // Optional auth — DB failure should not block the request
        logger.warn("Optional auth DB error", { error: String(dbErr) });
        await next();
        return;
      }

      if (sessionRows.length > 0) {
        const session = sessionRows[0];
        if (session.expiresAt >= new Date() && !session.revokedAt) {
          const userRows = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.id, payload.sub))
            .limit(1);

          if (userRows.length > 0 && userRows[0].status === "active") {
            const userRow = userRows[0];
            c.set("user", {
              id: userRow.id,
              email: userRow.email,
              displayName: userRow.displayName,
              roles: userRow.roles ?? [],
              attributes: (userRow.attributes as User["attributes"]) ?? {},
              mfa: (userRow.mfa as User["mfa"]) ?? {
                totp: { enabled: false, backupCodes: [] },
                webauthn: { enabled: false },
              },
              passkeys: (userRow.passkeys as Passkey[]) ?? [],
              oauthProviders: (userRow.oauthProviders as OAuthProvider[]) ?? [],
              status: userRow.status as User["status"],
              subUserIds: userRow.subUserIds ?? [],
              sessionConfig: (userRow.sessionConfig as User["sessionConfig"]) ?? {},
              lastLoginAt: userRow.lastLoginAt,
              createdAt: userRow.createdAt,
              updatedAt: userRow.updatedAt,
            });
            c.set("session", {
              id: session.id,
              userId: session.userId,
              tokenId: session.tokenId,
              deviceFingerprint: (session.deviceFingerprint as DeviceFingerprint) ?? {},
              ipAddress: session.ipAddress,
              expiresAt: session.expiresAt,
              lastActivityAt: session.lastActivityAt,
              isActive: session.isActive,
            });
            c.set("token", payload);
          }
        }
      }
    } catch {
      // ignore — optional auth
    }

    await next();
  } catch (error) {
    logger.warn("Optional auth middleware error", { error: String(error) });
    await next();
  }
});

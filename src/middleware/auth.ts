import { and, eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { getConfig } from "../config";
import { getDb } from "../db";
import { sessionsTable, usersTable } from "../db/schema";
import { getLogger } from "../logger";
import {
  enforceConcurrentSessionCap,
  evaluateSessionPolicy,
  getEffectiveSessionPolicy,
} from "../services/sessionPolicy.service";
import { TokenService } from "../services/token.service";
import { describePrincipal, principalFromToken } from "../shared/principal";
import type { HonoEnv, TokenPayload } from "../shared/types";
import { ErrorCodes, ZeroAuthError } from "../shared/types";
import { revokeSession } from "./sessionControl";

const logger = getLogger("auth-middleware");
let tokenService: TokenService;

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
        { error: ErrorCodes.TOKEN_INVALID, message: "Missing or malformed Authorization header" },
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
          { error: ErrorCodes.TOKEN_EXPIRED, message: "Access token has expired" },
          401
        );
      }
      return c.json({ error: ErrorCodes.TOKEN_INVALID, message: "Invalid or tampered token" }, 401);
    }

    const db = getDb();

    const sessionRows = await db
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

    if (sessionRows.length === 0) {
      return c.json(
        { error: ErrorCodes.SESSION_NOT_FOUND, message: "Session not found or revoked" },
        401
      );
    }

    const session = sessionRows[0];

    if (session.expiresAt < new Date()) {
      await db
        .update(sessionsTable)
        .set({ isActive: false })
        .where(eq(sessionsTable.id, session.id));
      return c.json({ error: ErrorCodes.SESSION_EXPIRED, message: "Session has expired" }, 401);
    }

    if (session.revokedAt) {
      return c.json({ error: ErrorCodes.TOKEN_REVOKED, message: "Session has been revoked" }, 401);
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

    const userRows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, payload.sub))
      .limit(1);

    if (userRows.length === 0) {
      return c.json({ error: ErrorCodes.USER_NOT_FOUND, message: "User not found" }, 401);
    }

    const userRow = userRows[0];

    if (userRow.status === "deleted") {
      return c.json(
        { error: ErrorCodes.USER_DELETED, message: "User account has been deleted" },
        401
      );
    }

    if (userRow.status === "suspended") {
      return c.json(
        { error: ErrorCodes.USER_SUSPENDED, message: "User account is suspended" },
        403
      );
    }

    // Set typed context variables
    c.set("user", {
      id: userRow.id,
      email: userRow.email,
      username: userRow.username,
      passwordHash: userRow.passwordHash,
      phone: userRow.phone,
      displayName: userRow.displayName,
      avatarUrl: userRow.avatarUrl,
      roles: userRow.roles ?? [],
      attributes: (userRow.attributes as any) ?? {},
      mfa: (userRow.mfa as any) ?? {
        totp: { enabled: false, backupCodes: [] },
        webauthn: { enabled: false },
      },
      passkeys: (userRow.passkeys as any[]) ?? [],
      oauthProviders: (userRow.oauthProviders as any[]) ?? [],
      status: userRow.status as any,
      parentUserId: userRow.parentUserId,
      subUserIds: userRow.subUserIds ?? [],
      sessionConfig: (userRow.sessionConfig as any) ?? {},
      lastLoginAt: userRow.lastLoginAt,
      metadata: userRow.metadata as any,
      createdAt: userRow.createdAt,
      updatedAt: userRow.updatedAt,
    });

    c.set("session", {
      id: session.id,
      userId: session.userId,
      tokenId: session.tokenId,
      deviceFingerprint: (session.deviceFingerprint as any) ?? {},
      ipAddress: session.ipAddress,
      country: session.country,
      userAgent: session.userAgent,
      expiresAt: session.expiresAt,
      lastActivityAt: session.lastActivityAt,
      isActive: session.isActive,
      revokedAt: session.revokedAt,
      revokedReason: session.revokedReason,
      proofOfPossessionKey: session.proofOfPossessionKey,
      continuousEvalResult: session.continuousEvalResult as any,
      anomalyFlags: session.anomalyFlags as any,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });

    c.set("token", payload);

    // Derive audit principal from token (agent/human + delegation chain)
    const auditPrincipal = principalFromToken(payload);
    c.set("auditPrincipal", auditPrincipal);

    // Update last activity
    await db
      .update(sessionsTable)
      .set({ lastActivityAt: new Date() })
      .where(eq(sessionsTable.id, session.id));

    logger.debug("✓ Token verified", {
      userId: payload.sub,
      sessionId: payload.sid,
      principal: describePrincipal(auditPrincipal),
    });
    return next();
  } catch (error) {
    if (error instanceof ZeroAuthError) {
      return c.json({ error: error.code, message: error.message }, error.statusCode as any);
    }
    logger.error("Auth middleware error", error as Error);
    return c.json({ error: "INTERNAL_ERROR", message: "Authentication failed" }, 500);
  }
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

      const sessionRows = await db
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
              attributes: (userRow.attributes as any) ?? {},
              mfa: (userRow.mfa as any) ?? {},
              passkeys: (userRow.passkeys as any[]) ?? [],
              oauthProviders: (userRow.oauthProviders as any[]) ?? [],
              status: userRow.status as any,
              subUserIds: userRow.subUserIds ?? [],
              sessionConfig: (userRow.sessionConfig as any) ?? {},
              lastLoginAt: userRow.lastLoginAt,
              createdAt: userRow.createdAt,
              updatedAt: userRow.updatedAt,
            });
            c.set("session", {
              id: session.id,
              userId: session.userId,
              tokenId: session.tokenId,
              deviceFingerprint: (session.deviceFingerprint as any) ?? {},
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

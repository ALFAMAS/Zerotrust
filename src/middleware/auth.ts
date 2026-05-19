/**
 * PASETO Token Verification Middleware
 * Verifies token signature, expiry, and session validity
 */

import type { Request, Response, NextFunction } from "express";
import type { TokenPayload, Session, User } from "../shared/types";
import { ErrorCodes, ZeroAuthError } from "../shared/types";
import { TokenService } from "../services/token.service";
import { SessionModel, UserModel } from "../models";
import { getLogger } from "../logger";
import { getConfig } from "../config";

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: User;
      session?: Session & { _id: string };
      token?: TokenPayload;
      correlationId?: string;
    }
  }
}

const logger = getLogger("auth-middleware");
let tokenService: TokenService;

/**
 * Initialize auth middleware (call this at app startup)
 */
export async function initAuthMiddleware(): Promise<void> {
  const config = getConfig();
  tokenService = new TokenService(config.security.tokenSecretHex, config.session);
  await tokenService.init();
  logger.info("✓ Auth middleware initialized");
}

/**
 * Main authentication middleware
 * Extracts and verifies PASETO token, validates session
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new ZeroAuthError(
        ErrorCodes.TOKEN_INVALID,
        "Missing or malformed Authorization header",
        401
      );
    }

    const token = authHeader.substring(7); // Remove "Bearer "

    // Verify token signature and expiry
    let payload: TokenPayload;
    try {
      payload = await tokenService.verifyAccessToken(token);
    } catch (error) {
      if (error instanceof Error && error.message === "TOKEN_EXPIRED") {
        throw new ZeroAuthError(
          ErrorCodes.TOKEN_EXPIRED,
          "Access token has expired",
          401
        );
      }
      throw new ZeroAuthError(
        ErrorCodes.TOKEN_INVALID,
        "Invalid or tampered token",
        401
      );
    }

    // Verify session exists and is active
    const session = await SessionModel.findOne({
      tokenId: payload.jti,
      userId: payload.sub,
      isActive: true,
    });

    if (!session) {
      throw new ZeroAuthError(
        ErrorCodes.SESSION_NOT_FOUND,
        "Session not found or revoked",
        401
      );
    }

    // Check if session has expired
    if (session.expiresAt < new Date()) {
      session.isActive = false;
      await session.save();
      throw new ZeroAuthError(
        ErrorCodes.SESSION_EXPIRED,
        "Session has expired",
        401
      );
    }

    // Check if session was revoked
    if (session.revokedAt) {
      throw new ZeroAuthError(
        ErrorCodes.TOKEN_REVOKED,
        "Session has been revoked",
        401
      );
    }

    // Fetch user document
    const user = await UserModel.findById(payload.sub);
    if (!user) {
      throw new ZeroAuthError(
        ErrorCodes.USER_NOT_FOUND,
        "User not found",
        401
      );
    }

    // Check user status
    if (user.status === "deleted") {
      throw new ZeroAuthError(
        ErrorCodes.USER_DELETED,
        "User account has been deleted",
        401
      );
    }

    if (user.status === "suspended") {
      throw new ZeroAuthError(
        ErrorCodes.USER_SUSPENDED,
        "User account is suspended",
        403
      );
    }

    // Attach to request
    req.user = user;
    req.session = { ...session.toObject(), _id: session._id.toString() };
    req.token = payload;

    // Update last activity timestamp
    session.lastActivityAt = new Date();
    await session.save();

    logger.debug("✓ Token verified", {
      userId: payload.sub,
      sessionId: payload.sid,
    });

    next();
  } catch (error) {
    if (error instanceof ZeroAuthError) {
      res.status(error.statusCode).json({
        error: error.code,
        message: error.message,
      });
    } else {
      logger.error("Auth middleware error", error as Error);
      res.status(500).json({
        error: "INTERNAL_ERROR",
        message: "Authentication failed",
      });
    }
  }
}

/**
 * Optional authentication middleware
 * Does not fail if token is missing, but validates if present
 */
export async function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // No token provided, continue without authentication
      next();
      return;
    }

    const token = authHeader.substring(7);

    // Attempt to verify (but don't fail)
    try {
      const payload = await tokenService.verifyAccessToken(token);

      const session = await SessionModel.findOne({
        tokenId: payload.jti,
        userId: payload.sub,
        isActive: true,
      });

      if (session && session.expiresAt >= new Date() && !session.revokedAt) {
        const user = await UserModel.findById(payload.sub);
        if (user && user.status === "active") {
          req.user = user;
          req.session = { ...session.toObject(), _id: session._id.toString() };
          req.token = payload;
        }
      }
    } catch {
      // Token invalid or session doesn't exist, continue without user
    }

    next();
  } catch (error) {
    logger.warn("Optional auth middleware error", error as Error);
    next();
  }
}

/**
 * Require authentication (guards protected routes)
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user || !req.session || !req.token) {
    res.status(401).json({
      error: ErrorCodes.TOKEN_INVALID,
      message: "Authentication required",
    });
    return;
  }
  next();
}

/**
 * Verify user has specific status
 */
export function requireStatus(...statuses: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !statuses.includes(req.user.status)) {
      res.status(403).json({
        error: "STATUS_MISMATCH",
        message: `User status must be one of: ${statuses.join(", ")}`,
      });
      return;
    }
    next();
  };
}

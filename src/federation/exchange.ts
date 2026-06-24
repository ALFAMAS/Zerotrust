import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { getConfig } from "../config/index.js";
import { getDb } from "../db/index.js";
import { sessionsTable, usersTable } from "../db/schema.js";
import { getLogger } from "../logger/index.js";
import { TokenService } from "../services/token.service.js";
import { getProvider } from "./registry.js";
import type {
  FederationTokenRequest,
  FederationTokenResponse,
} from "./types.js";
import { verifySubjectToken } from "./verify.js";

const logger = getLogger("federation-exchange");

let _tokenService: TokenService | null = null;
async function getTokenService(): Promise<TokenService> {
  if (_tokenService) return _tokenService;
  const cfg = getConfig();
  _tokenService = new TokenService(cfg.security.tokenSecretHex, cfg.session);
  await _tokenService.init();
  return _tokenService;
}

export async function exchangeToken(
  req: FederationTokenRequest,
  remoteIp: string,
): Promise<FederationTokenResponse> {
  const provider = await getProvider(req.providerId);
  if (!provider)
    throw new Error(`Unknown federation provider: ${req.providerId}`);
  if (!provider.enabled)
    throw new Error(`Federation provider ${req.providerId} is disabled`);

  const claim = await verifySubjectToken(req.subjectToken, provider);

  if (!claim.email)
    throw new Error("Federation provider did not supply an email address");

  const db = getDb();
  let userRows = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, claim.email.toLowerCase()))
    .limit(1);

  if (userRows.length === 0) {
    const [created] = await db
      .insert(usersTable)
      .values({
        email: claim.email.toLowerCase(),
        displayName: claim.email.split("@")[0],
        roles: ["user"],
        status: "active",
      } as any)
      .returning();
    userRows = [created];
  }

  const user = userRows[0];
  const svc = await getTokenService();
  const cfg = getConfig();
  const sessionId = crypto.randomUUID();
  const scopes = req.scope?.split(" ") ?? ["openid"];

  const accessToken = await svc.signAccessToken({
    sub: user.id,
    email: user.email,
    sid: sessionId,
    aud: req.audience ?? "zerotrust",
    scope: scopes,
  });

  const payload = await svc.verifyAccessToken(accessToken);

  await db.insert(sessionsTable).values({
    id: sessionId,
    userId: user.id,
    tokenId: payload.jti,
    deviceFingerprint: { source: "federation", providerId: req.providerId },
    ipAddress: remoteIp,
    expiresAt: new Date(payload.exp * 1000),
    isActive: true,
  });

  logger.warn("Federated token issued", {
    providerId: req.providerId,
    email: user.email,
  });

  return {
    accessToken,
    tokenType: "Bearer",
    expiresIn: cfg.session.defaultTTL,
    issuedTokenType: "urn:ietf:params:oauth:token-type:access_token",
  };
}

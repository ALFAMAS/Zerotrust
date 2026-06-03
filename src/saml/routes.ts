import { Hono } from "hono";
import { buildAuthnRequest, parseSAMLResponse, consumeRelayState, buildSPMetadata } from "./sp.js";
import { getDb } from "../db/index.js";
import { usersTable, sessionsTable, refreshTokensTable } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { TokenService } from "../services/token.service.js";
import { getConfig } from "../config/index.js";
import { rateLimit } from "../middleware/rateLimiting.js";
import { getLogger } from "../logger/index.js";
import type { HonoEnv } from "../shared/types.js";
import * as nodeCrypto from "crypto";
import { nanoid } from "nanoid";

const router = new Hono<HonoEnv>();
const logger = getLogger("saml-routes");

const SP_ENTITY_ID = process.env.SAML_SP_ENTITY_ID ?? "http://localhost:3000/saml/metadata";
const ACS_URL = process.env.SAML_ACS_URL ?? "http://localhost:3000/saml/acs";
const IDP_ENTITY_ID = process.env.SAML_IDP_ENTITY_ID ?? "";
const IDP_SSO_URL = process.env.SAML_IDP_SSO_URL ?? "";
const IDP_CERT = process.env.SAML_IDP_CERT ?? "";

const spConfig = {
  entityId: SP_ENTITY_ID,
  assertionConsumerServiceUrl: ACS_URL,
};

const idpConfig = {
  entityId: IDP_ENTITY_ID,
  ssoUrl: IDP_SSO_URL,
  certificate: IDP_CERT,
};

let tokenServiceInstance: TokenService | null = null;
async function getTokenService(): Promise<TokenService> {
  if (tokenServiceInstance) return tokenServiceInstance;
  const cfg = getConfig();
  tokenServiceInstance = new TokenService(cfg.security.tokenSecretHex, cfg.session);
  await tokenServiceInstance.init();
  return tokenServiceInstance;
}

function hashToken(token: string): string {
  return nodeCrypto.createHash("sha256").update(token).digest("hex");
}

// ─── SP Metadata ──────────────────────────────────────────────────────────────

router.get("/saml/metadata", (c) => {
  const xml = buildSPMetadata(spConfig);
  c.header("Content-Type", "application/xml");
  return c.body(xml);
});

// ─── SP-Initiated Login ───────────────────────────────────────────────────────

router.get("/saml/login", rateLimit({ points: 20, windowSecs: 60 }), (c) => {
  if (!IDP_SSO_URL) {
    return c.json(
      {
        code: "SAML_NOT_CONFIGURED",
        message: "SAML IdP is not configured. Set SAML_IDP_* env vars.",
        details: [],
      },
      503
    );
  }

  const redirect = c.req.query("redirect");
  const { redirectUrl } = buildAuthnRequest(spConfig, idpConfig, { redirectUrl: redirect });

  return c.redirect(redirectUrl);
});

// ─── Assertion Consumer Service (POST binding) ────────────────────────────────

router.post("/saml/acs", rateLimit({ points: 20, windowSecs: 60 }), async (c) => {
  try {
    // Parse form-urlencoded body
    let SAMLResponse: string | undefined;
    let RelayState: string | undefined;

    try {
      const formData = await c.req.formData();
      SAMLResponse = formData.get("SAMLResponse")?.toString();
      RelayState = formData.get("RelayState")?.toString();
    } catch {
      const body = (await c.req.json()) as Record<string, string>;
      SAMLResponse = body.SAMLResponse;
      RelayState = body.RelayState;
    }

    if (!SAMLResponse) {
      return c.json(
        { code: "INVALID_REQUEST", message: "SAMLResponse is required", details: [] },
        400
      );
    }

    const relayEntry = RelayState ? consumeRelayState(RelayState) : null;

    let assertion;
    try {
      assertion = parseSAMLResponse(SAMLResponse, idpConfig, spConfig);
    } catch (parseErr) {
      logger.warn("SAML assertion parse failed", { error: String(parseErr) });
      return c.json(
        {
          code: "SAML_ASSERTION_INVALID",
          message: (parseErr as Error).message,
          details: [],
        },
        401
      );
    }

    // Map NameID or attributes to email
    const email = assertion.nameId.includes("@")
      ? assertion.nameId
      : (assertion.attributes["email"] as string) ||
        (assertion.attributes[
          "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
        ] as string);

    if (!email) {
      return c.json(
        {
          code: "SAML_NO_EMAIL",
          message: "IdP did not provide an email in the assertion",
          details: [],
        },
        400
      );
    }

    const displayName =
      (assertion.attributes["displayName"] as string) ||
      (assertion.attributes["name"] as string) ||
      (assertion.attributes[
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"
      ] as string) ||
      email.split("@")[0];

    // Provision or retrieve user
    const db = getDb();
    const normalizedEmail = email.toLowerCase();

    let userRows = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .limit(1);

    if (userRows.length === 0) {
      await db.insert(usersTable).values({
        email: normalizedEmail,
        displayName: displayName ?? normalizedEmail,
        roles: ["user"],
        status: "active",
      });
      userRows = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, normalizedEmail))
        .limit(1);
    }

    if (userRows.length === 0) {
      return c.json(
        { code: "INTERNAL_ERROR", message: "User provisioning failed", details: [] },
        500
      );
    }

    const userRow = userRows[0];
    const svc = await getTokenService();
    const cfg = getConfig();
    const sessionId = nanoid();

    const accessToken = await svc.signAccessToken({
      sub: userRow.id,
      email: userRow.email,
      sid: sessionId,
      aud: "zeroauth",
      scope: ["openid"],
    });

    const tokenPayload = await svc.verifyAccessToken(accessToken);

    await db.insert(sessionsTable).values({
      userId: userRow.id,
      tokenId: tokenPayload.jti,
      deviceFingerprint: {
        hash: "saml",
        languages: [],
        isTrusted: false,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      },
      ipAddress: c.req.header("x-forwarded-for") ?? "unknown",
      userAgent: c.req.header("user-agent") ?? "",
      expiresAt: new Date(tokenPayload.exp * 1000),
      isActive: true,
    });

    const refreshPlain = await svc.signRefreshToken();

    const sessionRows = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.tokenId, tokenPayload.jti))
      .limit(1);

    if (sessionRows.length > 0) {
      await db.insert(refreshTokensTable).values({
        userId: userRow.id,
        sessionId: sessionRows[0].id,
        tokenHash: hashToken(refreshPlain),
        expiresAt: new Date(Date.now() + cfg.session.refreshTokenTTL * 1000),
      });
    }

    const redirectTo = relayEntry?.redirectUrl ?? process.env.LOGIN_SUCCESS_URL ?? "/";
    const successUrl = new URL(
      redirectTo,
      process.env.APP_URL ?? process.env.APP_BASE_URL ?? "http://localhost:3000"
    );
    successUrl.searchParams.set("access_token", accessToken);
    successUrl.searchParams.set("refresh_token", refreshPlain);

    return c.redirect(successUrl.toString());
  } catch (err) {
    logger.warn("SAML ACS error", { error: String(err) });
    return c.json({ code: "INTERNAL_ERROR", message: "SAML login failed", details: [] }, 500);
  }
});

export default router;

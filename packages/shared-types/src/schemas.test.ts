import { describe, expect, it } from "vitest";
import {
  acceptOrgInviteSchema,
  apiErrorEnvelopeSchema,
  loginSchema,
  orgInviteSchema,
  orgSecurityPolicyFormSchema,
  paginationQuerySchema,
  parsePaginationQuery,
  registerSchema,
  replySupportTicketSchema,
  supportTicketSchema,
  updateOrgSchema,
  updateOrgSecurityPolicySchema,
} from "./index.js";

describe("@zerotrust/shared-types schemas", () => {
  it("paginationQuerySchema enforces bounds matching API defaults", () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
    expect(paginationQuerySchema.parse({ page: "2", limit: "50" })).toEqual({
      page: 2,
      limit: 50,
    });
    expect(paginationQuerySchema.safeParse({ limit: "999" }).success).toBe(false);
  });

  it("parsePaginationQuery mirrors API offset math", () => {
    expect(parsePaginationQuery({ page: "3", limit: "10" })).toEqual({
      page: 3,
      limit: 10,
      offset: 20,
    });
  });

  it("registerSchema rejects weak passwords", () => {
    const weak = registerSchema.safeParse({
      email: "user@example.com",
      password: "short",
    });
    expect(weak.success).toBe(false);

    const ok = registerSchema.safeParse({
      email: "user@example.com",
      password: "Str0ng!pass",
      displayName: "User",
    });
    expect(ok.success).toBe(true);
  });

  it("loginSchema requires only a valid email and a non-empty password", () => {
    // Unlike registration, login must accept passwords created under older/looser
    // complexity rules — it only checks presence, not strength.
    expect(loginSchema.safeParse({ email: "user@example.com", password: "x" }).success).toBe(
      true
    );
    expect(loginSchema.safeParse({ email: "not-an-email", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "user@example.com", password: "" }).success).toBe(
      false
    );
  });

  it("org invite and accept schemas match API route contracts", () => {
    expect(orgInviteSchema.parse({ email: "a@b.com" })).toEqual({
      email: "a@b.com",
      role: "member",
    });
    expect(acceptOrgInviteSchema.parse({ token: "abc" })).toEqual({ token: "abc" });
  });

  it("organization update schemas normalize input and reject invalid contact fields", () => {
    expect(
      updateOrgSchema.parse({
        name: "  Acme Security  ",
        billingEmail: "billing@example.com",
        logoUrl: "https://example.com/logo.png",
      })
    ).toEqual({
      name: "Acme Security",
      billingEmail: "billing@example.com",
      logoUrl: "https://example.com/logo.png",
    });
    expect(updateOrgSchema.safeParse({ billingEmail: "not-email" }).success).toBe(false);
    expect(updateOrgSchema.safeParse({ logoUrl: "not-url" }).success).toBe(false);
    expect(updateOrgSchema.parse({ billingEmail: "", logoUrl: "" })).toEqual({
      billingEmail: null,
      logoUrl: null,
    });

    expect(
      updateOrgSecurityPolicySchema.safeParse({
        requirePasskeyAttestation: false,
        requireHardwarePasskey: false,
        allowedPasskeyAaguids: [],
        deniedPasskeyAaguids: [],
        ipAllowlist: [],
        maxSessionAgeSeconds: 0,
        idleTimeoutSeconds: 0,
        maxConcurrentSessions: 0,
        allowedCountries: ["AU", "US"],
      }).success
    ).toBe(true);
    expect(
      updateOrgSecurityPolicySchema.safeParse({ allowedCountries: ["AUS"] }).success
    ).toBe(false);
    expect(
      orgSecurityPolicyFormSchema.parse({
        requirePasskeyAttestation: false,
        requireHardwarePasskey: false,
        allowedPasskeyAaguids: " AAGUID-1, aaguid-2 ",
        deniedPasskeyAaguids: "",
        ipAllowlist: "203.0.113.0/24",
        maxSessionAgeMinutes: 30,
        idleTimeoutMinutes: 5,
        maxConcurrentSessions: 2,
        allowedCountries: "au us",
      })
    ).toEqual({
      requirePasskeyAttestation: false,
      requireHardwarePasskey: false,
      allowedPasskeyAaguids: ["aaguid-1", "aaguid-2"],
      deniedPasskeyAaguids: [],
      ipAllowlist: ["203.0.113.0/24"],
      maxSessionAgeSeconds: 1800,
      idleTimeoutSeconds: 300,
      maxConcurrentSessions: 2,
      allowedCountries: ["AU", "US"],
    });
  });

  it("support schemas trim messages and enforce API length limits", () => {
    expect(
      supportTicketSchema.parse({
        subject: "  Login problem  ",
        message: "  I cannot sign in.  ",
        priority: "normal",
      })
    ).toEqual({
      subject: "Login problem",
      message: "I cannot sign in.",
      priority: "normal",
    });
    expect(supportTicketSchema.safeParse({ subject: "", message: "Help" }).success).toBe(false);
    expect(replySupportTicketSchema.parse({ body: "  Thanks  " })).toEqual({ body: "Thanks" });
    expect(replySupportTicketSchema.safeParse({ body: "   " }).success).toBe(false);
  });

  it("apiErrorEnvelopeSchema accepts canonical 4xx/5xx bodies", () => {
    expect(apiErrorEnvelopeSchema.parse({ error: "NOT_FOUND" })).toEqual({
      error: "NOT_FOUND",
    });
    expect(
      apiErrorEnvelopeSchema.parse({ error: "VALIDATION_ERROR", message: "Invalid email" })
    ).toEqual({
      error: "VALIDATION_ERROR",
      message: "Invalid email",
    });
  });
});

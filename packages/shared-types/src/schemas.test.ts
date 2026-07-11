import { describe, expect, it } from "vitest";
import {
  acceptOrgInviteSchema,
  apiErrorEnvelopeSchema,
  orgInviteSchema,
  paginationQuerySchema,
  parsePaginationQuery,
  registerSchema,
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

  it("org invite and accept schemas match API route contracts", () => {
    expect(orgInviteSchema.parse({ email: "a@b.com" })).toEqual({
      email: "a@b.com",
      role: "member",
    });
    expect(acceptOrgInviteSchema.parse({ token: "abc" })).toEqual({ token: "abc" });
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

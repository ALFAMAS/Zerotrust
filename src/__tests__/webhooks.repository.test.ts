import { describe, expect, it } from "vitest";
import { webhooksRepo } from "../db/repositories/webhooks.repository";

describe("webhooksRepo", () => {
  it("requires orgId at construction", () => {
    expect(() => webhooksRepo("")).toThrow("ORG_ID_REQUIRED");
  });

  it("exposes scoped orgId on the repo handle", () => {
    const orgId = "00000000-0000-4000-8000-000000000001";
    const repo = webhooksRepo(orgId);
    expect(repo.orgId).toBe(orgId);
    expect(typeof repo.listEndpoints).toBe("function");
    expect(typeof repo.getEndpoint).toBe("function");
    expect(typeof repo.deleteEndpoint).toBe("function");
  });
});

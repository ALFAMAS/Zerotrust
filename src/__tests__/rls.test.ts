import { describe, expect, it, vi, beforeEach } from "vitest";

const execute = vi.fn().mockResolvedValue(undefined);

vi.mock("../db", () => ({
  getDb: vi.fn(() => ({
    transaction: vi.fn(async (fn: (tx: { execute: typeof execute }) => unknown) =>
      fn({ execute })
    ),
  })),
}));

describe("setOrgRlsContext", () => {
  beforeEach(() => {
    execute.mockClear();
  });

  it("issues three set_config calls when bypass is enabled", async () => {
    const { setOrgRlsContext } = await import("../db/rls");
    await setOrgRlsContext({ execute }, { bypass: true });
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("issues three set_config calls for org and user scope", async () => {
    const { setOrgRlsContext } = await import("../db/rls");
    await setOrgRlsContext({ execute }, { orgId: "org-1", userId: "user-1" });
    expect(execute).toHaveBeenCalledTimes(3);
  });
});

describe("withOrgRls", () => {
  it("runs callback inside a transaction", async () => {
    const { withOrgRls } = await import("../db/rls");
    const result = await withOrgRls({ orgId: "org-1" }, async () => "ok");
    expect(result).toBe("ok");
  });
});

describe("withRlsBypass", () => {
  it("runs callback with bypass context", async () => {
    const { withRlsBypass } = await import("../db/rls");
    const result = await withRlsBypass(async () => "bypassed");
    expect(result).toBe("bypassed");
    expect(execute).toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiGet } from "./apiClient";
import { solveSignupPow } from "./pow";

vi.mock("./apiClient", () => ({
  apiGet: vi.fn(),
}));

describe("solveSignupPow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an empty object when PoW is disabled", async () => {
    vi.mocked(apiGet).mockResolvedValue({ enabled: false });
    await expect(solveSignupPow()).resolves.toEqual({});
  });

  it("returns challenge and solution when PoW is enabled", async () => {
    vi.mocked(apiGet).mockResolvedValue({
      enabled: true,
      challenge: "abc",
      difficulty: 1,
    });
    const result = await solveSignupPow();
    expect(result.powChallenge).toBe("abc");
    expect(result.powSolution).toBeTruthy();
  });

  it("returns an empty object when the challenge fetch fails", async () => {
    vi.mocked(apiGet).mockRejectedValue(new Error("offline"));
    await expect(solveSignupPow()).resolves.toEqual({});
  });
});

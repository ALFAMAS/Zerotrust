import { describe, expect, it } from "vitest";

function buildAuthMethodMix(
  users: Array<{
    passwordHash: string | null;
    oauthProviders: unknown;
    passkeys: unknown;
  }>
) {
  let password = 0;
  let oauth = 0;
  let passkey = 0;
  for (const u of users) {
    if (Array.isArray(u.passkeys) && u.passkeys.length > 0) passkey++;
    if (Array.isArray(u.oauthProviders) && (u.oauthProviders as unknown[]).length > 0) oauth++;
    if (u.passwordHash) password++;
  }
  return { password, oauth, passkey, total: users.length };
}

function buildAnomalyTrends(
  sessions: Array<{ createdAt: Date; anomalyFlags: unknown }>,
  since: Date
) {
  const byDay = new Map<string, number>();
  for (const s of sessions) {
    if (s.createdAt < since) continue;
    if (!s.anomalyFlags) continue;
    const day = s.createdAt.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }
  return [...byDay.entries()].map(([date, flaggedSessions]) => ({ date, flaggedSessions }));
}

describe("admin analytics helpers", () => {
  it("buildAuthMethodMix counts auth methods", () => {
    const mix = buildAuthMethodMix([
      { passwordHash: "x", oauthProviders: [], passkeys: [] },
      { passwordHash: null, oauthProviders: [{ provider: "google" }], passkeys: [] },
      { passwordHash: null, oauthProviders: [], passkeys: [{ id: "pk" }] },
    ]);
    expect(mix.password).toBe(1);
    expect(mix.oauth).toBe(1);
    expect(mix.passkey).toBe(1);
    expect(mix.total).toBe(3);
  });

  it("buildAnomalyTrends groups flagged sessions by day", () => {
    const since = new Date("2026-01-01T00:00:00.000Z");
    const trends = buildAnomalyTrends(
      [
        { createdAt: new Date("2026-01-02T12:00:00.000Z"), anomalyFlags: { risk: 1 } },
        { createdAt: new Date("2026-01-02T18:00:00.000Z"), anomalyFlags: { risk: 1 } },
      ],
      since
    );
    expect(trends).toEqual([{ date: "2026-01-02", flaggedSessions: 2 }]);
  });
});

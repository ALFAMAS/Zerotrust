import { describe, expect, it } from "vitest";
import {
  assessSessionRisk,
  computeRiskFactors,
  type RiskFactors,
} from "../services/auth/sessionRisk.service";

const base: RiskFactors = {
  timeSinceLastActivity: 0,
  locationChanged: false,
  deviceChanged: false,
  anomalyScore: 0,
  sensitiveOperation: false,
};

describe("assessSessionRisk", () => {
  it("returns no reverification when nothing is risky", () => {
    const r = assessSessionRisk(base);
    expect(r.requiresReverification).toBe(false);
    expect(r.level).toBe("none");
    expect(r.maxAgeSeconds).toBe(3600);
  });

  it("escalates to HARD on a high anomaly score (> 0.8)", () => {
    const r = assessSessionRisk({ ...base, anomalyScore: 0.81 });
    expect(r.level).toBe("hard");
    expect(r.requiresReverification).toBe(true);
    expect(r.reason).toMatch(/anomaly/i);
    expect(r.maxAgeSeconds).toBe(300);
  });

  it("treats anomalyScore exactly 0.8 as NOT hard (strict > boundary)", () => {
    const r = assessSessionRisk({ ...base, anomalyScore: 0.8 });
    expect(r.level).not.toBe("hard");
  });

  it("escalates to HARD when location AND device both change", () => {
    const r = assessSessionRisk({ ...base, locationChanged: true, deviceChanged: true });
    expect(r.level).toBe("hard");
    expect(r.reason).toMatch(/location and device/i);
    expect(r.maxAgeSeconds).toBe(300);
  });

  it("does NOT escalate to hard when only the device changes", () => {
    const r = assessSessionRisk({ ...base, deviceChanged: true });
    expect(r.level).toBe("none");
    expect(r.requiresReverification).toBe(false);
  });

  it("requires SOFT reverification after >1h inactivity", () => {
    const r = assessSessionRisk({ ...base, timeSinceLastActivity: 3601 });
    expect(r.level).toBe("soft");
    expect(r.reason).toMatch(/inactive/i);
    expect(r.maxAgeSeconds).toBe(1800);
  });

  it("requires SOFT reverification for a sensitive operation", () => {
    const r = assessSessionRisk({ ...base, sensitiveOperation: true });
    expect(r.level).toBe("soft");
    expect(r.reason).toMatch(/sensitive/i);
    expect(r.maxAgeSeconds).toBe(1800);
  });

  it("requires SOFT reverification on a location change alone", () => {
    const r = assessSessionRisk({ ...base, locationChanged: true });
    expect(r.level).toBe("soft");
    expect(r.reason).toMatch(/new location/i);
    expect(r.maxAgeSeconds).toBe(900);
  });

  it("prefers HARD over SOFT when both would apply (fails safe to stricter)", () => {
    const r = assessSessionRisk({
      ...base,
      anomalyScore: 0.9,
      sensitiveOperation: true,
      timeSinceLastActivity: 99999,
    });
    expect(r.level).toBe("hard");
    expect(r.maxAgeSeconds).toBe(300);
  });
});

describe("computeRiskFactors", () => {
  const session = {
    lastActivityAt: new Date(Date.now() - 10_000),
    country: "US",
    deviceFingerprint: { userAgent: "Mozilla/5.0 (orig)" },
    anomalyFlags: { score: 0.42 },
  };

  it("derives elapsed seconds since last activity", () => {
    const f = computeRiskFactors(session, {});
    expect(f.timeSinceLastActivity).toBeGreaterThanOrEqual(9);
    expect(f.timeSinceLastActivity).toBeLessThan(60);
  });

  it("treats a null lastActivityAt as 'just now' (0s)", () => {
    const f = computeRiskFactors({ ...session, lastActivityAt: null }, {});
    expect(f.timeSinceLastActivity).toBe(0);
  });

  it("flags a location change only when both countries are known and differ", () => {
    expect(computeRiskFactors(session, { country: "FR" }).locationChanged).toBe(true);
    expect(computeRiskFactors(session, { country: "US" }).locationChanged).toBe(false);
    expect(computeRiskFactors(session, {}).locationChanged).toBe(false);
    expect(computeRiskFactors({ ...session, country: null }, { country: "FR" }).locationChanged).toBe(
      false
    );
  });

  it("flags a device change only when both user-agents are known and differ", () => {
    expect(computeRiskFactors(session, { userAgent: "Mozilla/5.0 (other)" }).deviceChanged).toBe(
      true
    );
    expect(computeRiskFactors(session, { userAgent: "Mozilla/5.0 (orig)" }).deviceChanged).toBe(
      false
    );
    expect(computeRiskFactors(session, {}).deviceChanged).toBe(false);
  });

  it("reads the anomaly score from anomalyFlags, defaulting to 0", () => {
    expect(computeRiskFactors(session, {}).anomalyScore).toBe(0.42);
    expect(computeRiskFactors({ ...session, anomalyFlags: null }, {}).anomalyScore).toBe(0);
    expect(computeRiskFactors({ ...session, anomalyFlags: {} }, {}).anomalyScore).toBe(0);
  });

  it("passes through the sensitiveOperation flag and tolerates malformed inputs", () => {
    expect(computeRiskFactors(session, {}, { sensitiveOperation: true }).sensitiveOperation).toBe(
      true
    );
    // Malformed fingerprint / flags must not throw.
    const f = computeRiskFactors(
      { lastActivityAt: null, country: null, deviceFingerprint: "nope", anomalyFlags: 7 },
      { country: "DE", userAgent: "x" }
    );
    expect(f.deviceChanged).toBe(false);
    expect(f.anomalyScore).toBe(0);
  });
});

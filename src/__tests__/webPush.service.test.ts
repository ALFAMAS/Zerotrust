import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The DB module is mocked so importing the service never touches a real
// connection — these tests cover the env-driven configuration surface, which
// is what determines whether push is active on a deployment.
vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

import {
  getVapidPublicKey,
  isWebPushConfigured,
} from "../services/webPush.service";

describe("webPush.service configuration", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("reports unconfigured when VAPID keys are absent", () => {
    expect(isWebPushConfigured()).toBe(false);
    expect(getVapidPublicKey()).toBeNull();
  });

  it("requires BOTH keys to be considered configured", () => {
    process.env.VAPID_PUBLIC_KEY = "pub";
    expect(isWebPushConfigured()).toBe(false); // private key still missing
    process.env.VAPID_PRIVATE_KEY = "priv";
    expect(isWebPushConfigured()).toBe(true);
  });

  it("exposes the public key for client subscription", () => {
    process.env.VAPID_PUBLIC_KEY = "BNcRZ-public-key";
    expect(getVapidPublicKey()).toBe("BNcRZ-public-key");
  });
});

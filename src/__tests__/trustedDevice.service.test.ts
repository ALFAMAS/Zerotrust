import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { getDb } from "../db";
import {
  listTrustedDevices,
  registerTrustedDevice,
  removeTrustedDevice,
  isDeviceTrusted,
  updateLastUsed,
} from "../services/trustedDevice.service";

const getDbMock = getDb as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  getDbMock.mockReset();
});

describe("listTrustedDevices", () => {
  it("returns the org's devices ordered by creation", async () => {
    const devices = [{ id: "d1", orgId: "o1" }, { id: "d2", orgId: "o1" }];
    const orderBy = vi.fn().mockResolvedValue(devices);
    getDbMock.mockReturnValue({
      select: () => ({ from: () => ({ where: () => ({ orderBy }) }) }),
    });
    const result = await listTrustedDevices("o1");
    expect(result).toEqual(devices);
  });
});

describe("registerTrustedDevice", () => {
  it("inserts a device and returns it", async () => {
    const device = { id: "d1", orgId: "o1", userId: "u1", deviceName: "Laptop" };
    const returning = vi.fn().mockResolvedValue([device]);
    getDbMock.mockReturnValue({
      insert: () => ({ values: () => ({ returning }) }),
    });
    const result = await registerTrustedDevice({
      orgId: "o1",
      userId: "u1",
      deviceName: "Laptop",
      deviceFingerprint: "fp-123",
      registeredBy: "admin-1",
    });
    expect(result).toEqual(device);
  });
});

describe("removeTrustedDevice", () => {
  it("returns true when a row was deleted", async () => {
    getDbMock.mockReturnValue({
      delete: () => ({ where: () => ({ returning: () => Promise.resolve([{ id: "d1" }]) }) }),
    });
    expect(await removeTrustedDevice("o1", "d1")).toBe(true);
  });

  it("returns false when nothing matched", async () => {
    getDbMock.mockReturnValue({
      delete: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }),
    });
    expect(await removeTrustedDevice("o1", "missing")).toBe(false);
  });
});

describe("isDeviceTrusted", () => {
  it("returns true when a matching fingerprint exists", async () => {
    getDbMock.mockReturnValue({
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: "d1" }]) }) }) }),
    });
    expect(await isDeviceTrusted("o1", "fp-123")).toBe(true);
  });

  it("returns false when no device matches the fingerprint", async () => {
    getDbMock.mockReturnValue({
      select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
    });
    expect(await isDeviceTrusted("o1", "unknown")).toBe(false);
  });
});

describe("updateLastUsed", () => {
  it("issues an update keyed on org + fingerprint", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    getDbMock.mockReturnValue({ update: () => ({ set }) });
    await expect(updateLastUsed("o1", "fp-123")).resolves.toBeUndefined();
    expect(set).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
  });
});

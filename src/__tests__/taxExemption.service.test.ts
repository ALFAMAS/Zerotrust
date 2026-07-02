import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../logger", () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { getDb } from "../db";
import {
  hasVerifiedExemption,
  isReverseCharge,
  listTaxExemptions,
  setExemptionStatus,
  submitTaxExemption,
} from "../services/billing/taxExemption.service";

const getDbMock = getDb as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => getDbMock.mockReset());

const insertReturning = (row: unknown) => ({
  insert: () => ({ values: () => ({ onConflictDoUpdate: () => ({ returning: () => Promise.resolve([row]) }) }) }),
});
const selectLimit = (rows: unknown[]) => ({
  select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }) }),
});
const selectOrderBy = (rows: unknown[]) => ({
  select: () => ({ from: () => ({ where: () => ({ orderBy: () => Promise.resolve(rows) }) }) }),
});
const updateReturning = (rows: unknown[]) => ({
  update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve(rows) }) }) }),
});

describe("submitTaxExemption", () => {
  it("rejects a malformed EU VAT number before touching the DB", async () => {
    const insert = vi.fn();
    getDbMock.mockReturnValue({ insert });
    const result = await submitTaxExemption({
      orgId: "o1",
      kind: "vat",
      taxId: "DE1", // too short
      country: "DE",
      submittedBy: "u1",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("INVALID_VAT_FORMAT");
    expect(insert).not.toHaveBeenCalled();
  });

  it("normalises + persists a well-formed VAT number", async () => {
    const row = { id: "e1", orgId: "o1", taxId: "DE123456789", status: "pending" };
    getDbMock.mockReturnValue(insertReturning(row));
    const result = await submitTaxExemption({
      orgId: "o1",
      kind: "vat",
      taxId: "de 123 456 789",
      country: "de",
      submittedBy: "u1",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.exemption).toEqual(row);
  });

  it("skips VAT format validation for a plain tax_id", async () => {
    const row = { id: "e2", kind: "tax_id" };
    getDbMock.mockReturnValue(insertReturning(row));
    const result = await submitTaxExemption({
      orgId: "o1",
      kind: "tax_id",
      taxId: "12-3456789",
      country: "US",
      submittedBy: "u1",
    });
    expect(result.ok).toBe(true);
  });
});

describe("hasVerifiedExemption", () => {
  it("is true when a verified exemption exists", async () => {
    getDbMock.mockReturnValue(selectLimit([{ id: "e1" }]));
    expect(await hasVerifiedExemption("o1")).toBe(true);
  });
  it("is false when none exist", async () => {
    getDbMock.mockReturnValue(selectLimit([]));
    expect(await hasVerifiedExemption("o1")).toBe(false);
  });
});

describe("isReverseCharge", () => {
  it("is true for a verified EU VAT exemption in a different country than the seller", async () => {
    getDbMock.mockReturnValue(selectLimit([{ country: "FR", kind: "vat" }]));
    expect(await isReverseCharge("o1", "DE")).toBe(true);
  });
  it("is false when the buyer and seller are in the same country", async () => {
    getDbMock.mockReturnValue(selectLimit([{ country: "DE", kind: "vat" }]));
    expect(await isReverseCharge("o1", "DE")).toBe(false);
  });
  it("is false for a non-VAT / non-EU exemption", async () => {
    getDbMock.mockReturnValue(selectLimit([{ country: "US", kind: "tax_id" }]));
    expect(await isReverseCharge("o1", "DE")).toBe(false);
  });
  it("is false when there is no verified exemption", async () => {
    getDbMock.mockReturnValue(selectLimit([]));
    expect(await isReverseCharge("o1", "DE")).toBe(false);
  });
});

describe("listTaxExemptions", () => {
  it("returns the org's exemptions", async () => {
    const rows = [{ id: "e1" }, { id: "e2" }];
    getDbMock.mockReturnValue(selectOrderBy(rows));
    expect(await listTaxExemptions("o1")).toEqual(rows);
  });
});

describe("setExemptionStatus", () => {
  it("returns the updated row", async () => {
    const row = { id: "e1", status: "verified" };
    getDbMock.mockReturnValue(updateReturning([row]));
    expect(await setExemptionStatus("e1", "verified")).toEqual(row);
  });
  it("returns null when no row matched", async () => {
    getDbMock.mockReturnValue(updateReturning([]));
    expect(await setExemptionStatus("missing", "rejected")).toBeNull();
  });
});

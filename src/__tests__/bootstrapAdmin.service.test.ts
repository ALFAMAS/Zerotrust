import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({ getDb: vi.fn() }));
vi.mock("../db/repositories/orgs.repository", () => ({
  createOrganizationWithOwner: vi.fn(),
}));
vi.mock("../shared/passwordHash", () => ({
  hashPassword: vi.fn().mockResolvedValue("argon2id-hash"),
}));
vi.mock("../services/auth/passwordBreach.service", () => ({
  rejectIfBreached: vi.fn().mockResolvedValue(null),
}));

import { getDb } from "../db";
import { createOrganizationWithOwner } from "../db/repositories/orgs.repository";
import { hashPassword } from "../shared/passwordHash";
import { rejectIfBreached } from "../services/auth/passwordBreach.service";
import { bootstrapAdmin } from "../services/bootstrap/bootstrapAdmin.service";

const mockGetDb = vi.mocked(getDb);
const mockCreateOrg = vi.mocked(createOrganizationWithOwner);
const mockHashPassword = vi.mocked(hashPassword);
const mockRejectIfBreached = vi.mocked(rejectIfBreached);

const VALID_INPUT = {
  email: "admin@example.com",
  password: "Admin123!",
  displayName: "Admin",
  orgName: "Acme Corp",
};

function makeBuilder(queue: unknown[][] = []) {
  let i = 0;
  const builder: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(() => Promise.resolve(queue[i++] ?? [])),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    returning: vi.fn(() => Promise.resolve(queue[i++] ?? [])),
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("bootstrapAdmin", () => {
  it("returns validation_error for weak passwords", async () => {
    const db = makeBuilder();
    mockGetDb.mockReturnValue(db as never);

    const result = await bootstrapAdmin({
      ...VALID_INPUT,
      password: "short",
    });

    expect(result).toEqual({
      ok: false,
      reason: "validation_error",
      message: "Password must be at least 8 characters",
    });
    expect(mockHashPassword).not.toHaveBeenCalled();
  });

  it("returns validation_error when HIBP rejects the password", async () => {
    mockRejectIfBreached.mockResolvedValueOnce("Password breached");
    const db = makeBuilder();
    mockGetDb.mockReturnValue(db as never);

    const result = await bootstrapAdmin(VALID_INPUT);

    expect(result).toEqual({
      ok: false,
      reason: "validation_error",
      message: "Password breached",
    });
  });

  it("is idempotent when the requested email already has admin", async () => {
    const db = makeBuilder([
      [{ id: "admin-1", email: "admin@example.com", roles: ["user", "admin"] }],
    ]);
    mockGetDb.mockReturnValue(db as never);

    const result = await bootstrapAdmin(VALID_INPUT);

    expect(result).toEqual({
      ok: true,
      status: "already_exists",
      userId: "admin-1",
      email: "admin@example.com",
    });
    expect(mockCreateOrg).not.toHaveBeenCalled();
    expect(mockHashPassword).not.toHaveBeenCalled();
  });

  it("fails safely when a different admin already exists", async () => {
    const db = makeBuilder([
      [{ id: "admin-1", email: "other@example.com", roles: ["user", "admin"] }],
    ]);
    mockGetDb.mockReturnValue(db as never);

    const result = await bootstrapAdmin(VALID_INPUT);

    expect(result).toEqual({
      ok: false,
      reason: "admin_exists",
      existingAdminEmail: "other@example.com",
    });
  });

  it("promotes an existing user and ensures a default org", async () => {
    const db = makeBuilder([
      [],
      [{ id: "user-1", email: "admin@example.com", roles: ["user"], emailVerifiedAt: null }],
      [],
      [{ orgId: "org-1" }],
    ]);
    mockGetDb.mockReturnValue(db as never);
    mockCreateOrg.mockResolvedValueOnce({
      id: "org-1",
      name: "Acme Corp",
      slug: "acme-corp",
      ownerId: "user-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await bootstrapAdmin(VALID_INPUT);

    expect(result).toEqual({
      ok: true,
      status: "promoted",
      userId: "user-1",
      orgId: "org-1",
      email: "admin@example.com",
    });
    expect(db.update).toHaveBeenCalled();
    expect(mockCreateOrg).toHaveBeenCalledWith({
      name: "Acme Corp",
      slug: "acme-corp",
      ownerId: "user-1",
    });
    expect(mockHashPassword).not.toHaveBeenCalled();
  });

  it("creates a new admin user with hashed password and default org", async () => {
    const db = makeBuilder([
      [],
      [],
      [{ id: "user-new", email: "admin@example.com" }],
      [],
    ]);
    mockGetDb.mockReturnValue(db as never);
    mockCreateOrg.mockResolvedValueOnce({
      id: "org-new",
      name: "Acme Corp",
      slug: "acme-corp",
      ownerId: "user-new",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await bootstrapAdmin(VALID_INPUT);

    expect(result).toEqual({
      ok: true,
      status: "created",
      userId: "user-new",
      orgId: "org-new",
      email: "admin@example.com",
    });
    expect(mockHashPassword).toHaveBeenCalledWith("Admin123!");
    expect(db.insert).toHaveBeenCalled();
    expect(db.values).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "admin@example.com",
        roles: ["user", "admin"],
        status: "active",
        passwordHash: "argon2id-hash",
      })
    );
    expect(mockCreateOrg).toHaveBeenCalledWith({
      name: "Acme Corp",
      slug: "acme-corp",
      ownerId: "user-new",
    });
  });
});

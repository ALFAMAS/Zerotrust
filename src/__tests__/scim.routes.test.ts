import { describe, expect, it } from "vitest";
import { parseScimUserName, toScimUser } from "../scim/mappers";

describe("SCIM mappers", () => {
  it("toScimUser maps core fields", () => {
    const user = toScimUser(
      {
        id: "u1",
        email: "user@example.com",
        displayName: "User",
        status: "active",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      },
      "https://api.test"
    );
    expect(user.userName).toBe("user@example.com");
    expect(user.active).toBe(true);
    expect(user.meta.location).toBe("https://api.test/scim/v2/Users/u1");
  });

  it("parseScimUserName reads userName and emails", () => {
    expect(parseScimUserName({ userName: "A@Example.COM" })).toBe("a@example.com");
    expect(
      parseScimUserName({ emails: [{ value: "b@example.com", primary: true }] })
    ).toBe("b@example.com");
    expect(parseScimUserName({})).toBeNull();
  });
});

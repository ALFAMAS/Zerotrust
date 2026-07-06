import { describe, expect, it } from "vitest";
import { AUTH_UI_REDIRECTS, LOGIN_PAGE_PATH, UI_ROUTE_REDIRECTS } from "./uiRouteRedirects";

function findRedirect(source: string) {
  return UI_ROUTE_REDIRECTS.find((r) => r.source === source);
}

describe("uiRouteRedirects", () => {
  describe("auth aliases", () => {
    it("maps /auth/login to the login page", () => {
      expect(findRedirect("/auth/login")?.destination).toBe(LOGIN_PAGE_PATH);
    });

    it("covers all public auth pages that share the API /auth prefix", () => {
      const sources = AUTH_UI_REDIRECTS.map((r) => r.source);
      expect(sources).toContain("/auth/login");
      expect(sources).toContain("/auth/register");
      expect(sources).toContain("/auth/magic-link/verify");
    });
  });

  describe("dashboard API aliases", () => {
    it("maps /wallet to /dashboard/wallet", () => {
      expect(findRedirect("/wallet")?.destination).toBe("/dashboard/wallet");
    });

    it("maps /billing to /dashboard/billing", () => {
      expect(findRedirect("/billing")?.destination).toBe("/dashboard/billing");
    });

    it("maps /wallet subpaths to the wallet page", () => {
      expect(findRedirect("/wallet/:path*")?.destination).toBe("/dashboard/wallet");
    });

    it("maps /orgs/:id to /dashboard/organizations/:id", () => {
      expect(findRedirect("/orgs/:path*")?.destination).toBe("/dashboard/organizations/:path*");
    });

    it("maps /api-keys to /dashboard/api-keys", () => {
      expect(findRedirect("/api-keys")?.destination).toBe("/dashboard/api-keys");
    });

    it("maps /jit/cross-tenant to /dashboard/jit", () => {
      expect(findRedirect("/jit/cross-tenant")?.destination).toBe("/dashboard/jit");
    });

    it("does not steal the public /security disclosure page", () => {
      expect(findRedirect("/security")).toBeUndefined();
    });
  });

  describe("locale prefix stripping", () => {
    it("maps /en to /", () => {
      expect(findRedirect("/:locale(en|es|fr|ar)")?.destination).toBe("/");
    });

    it("maps /:locale/:path* to /:path*", () => {
      expect(findRedirect("/:locale(en|es|fr|ar)/:path*")?.destination).toBe("/:path*");
    });
  });

  it("uses temporary redirects so aliases can change without cache stickiness", () => {
    expect(UI_ROUTE_REDIRECTS.every((r) => r.permanent === false)).toBe(true);
  });
});

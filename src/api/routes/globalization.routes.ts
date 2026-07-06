/**
 * Globalization billing endpoints — multi-currency pricing, PPP, location tax,
 * EU VAT validation, and org tax-exemption submission. Mounted at `/billing`.
 */

import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../../db";
import { organizationMembersTable } from "../../db/schema";
import { getLogger } from "../../logger";
import { authMiddleware } from "../../middleware/auth";
import { orgRlsMiddleware } from "../../middleware/orgRls";
import {
  calculateTax,
  getExchangeRates,
  getLocalizedPricing,
  isSupportedCurrency,
  pppForCountry,
  SUPPORTED_CURRENCIES,
  validateVatNumber,
} from "../../services/billing/globalization.service";
import {
  hasVerifiedExemption,
  isReverseCharge,
  listTaxExemptions,
  setExemptionStatus,
  submitTaxExemption,
} from "../../services/billing/taxExemption.service";
import { internalError } from "../../shared/httpErrors";
import { isAdmin } from "../../shared/roles";
import type { HonoEnv } from "../../shared/types";

const router = new Hono<HonoEnv>();
const logger = getLogger("globalization-routes");

// authMiddleware is applied per-route (this router shares the `/billing` prefix
// with billingRoutes, so a router-wide `use("*")` would leak onto its routes).

// M13: authorization checks read the primary, not the replica — a replica
// lag window could otherwise still authorize a member/admin who was just
// removed/demoted on the primary.
async function isOrgMember(orgId: string, userId: string): Promise<boolean> {
  const db = getDb();
  const [m] = await db
    .select({ id: organizationMembersTable.id })
    .from(organizationMembersTable)
    .where(
      and(eq(organizationMembersTable.orgId, orgId), eq(organizationMembersTable.userId, userId))
    )
    .limit(1);
  return Boolean(m);
}

async function canManageOrg(orgId: string, userId: string): Promise<boolean> {
  const db = getDb();
  const [m] = await db
    .select({ role: organizationMembersTable.role })
    .from(organizationMembersTable)
    .where(
      and(eq(organizationMembersTable.orgId, orgId), eq(organizationMembersTable.userId, userId))
    )
    .limit(1);
  return m?.role === "owner" || m?.role === "admin";
}

// GET /billing/currencies — supported currencies + current USD-based FX rates
router.get("/currencies", authMiddleware, async (c) => {
  try {
    const rates = await getExchangeRates();
    return c.json({ currencies: SUPPORTED_CURRENCIES, rates });
  } catch (err) {
    return internalError(c, logger, "Currencies error", err);
  }
});

// GET /billing/pricing?currency=EUR&country=IN&locale=en-US — localized + PPP pricing
router.get("/pricing", authMiddleware, async (c) => {
  try {
    const currency = (c.req.query("currency") ?? "USD").toUpperCase();
    if (!isSupportedCurrency(currency)) {
      return c.json(
        { error: "UNSUPPORTED_CURRENCY", message: `Currency ${currency} not supported` },
        400
      );
    }
    const country = c.req.query("country") ?? null;
    const locale = c.req.query("locale") ?? "en-US";
    const plans = await getLocalizedPricing(currency, country, locale);
    return c.json({ currency, country, ppp: pppForCountry(country), plans });
  } catch (err) {
    return internalError(c, logger, "Pricing error", err);
  }
});

const taxQuoteSchema = z.object({
  amount: z.number().int().nonnegative(),
  currency: z.string().min(3).max(3),
  country: z.string().min(2).max(2),
  region: z.string().optional(),
  orgId: z.string().uuid().optional(),
  sellerCountry: z.string().min(2).max(2).optional(),
});

// POST /billing/tax/quote — calculate tax (VAT/GST/sales tax) for a net amount.
// When orgId is supplied, a verified exemption zeroes tax (and EU B2B cross-border
// is reverse-charged).
router.post("/tax/quote", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    const body = await c.req.json().catch(() => ({}));
    const parsed = taxQuoteSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    }
    const { amount, currency, country, region, orgId, sellerCountry } = parsed.data;

    let exempt = false;
    let reverseCharge = false;
    if (orgId) {
      if (!(await isOrgMember(orgId, user.id))) {
        return c.json({ error: "FORBIDDEN", message: "Not a member of this org" }, 403);
      }
      exempt = await hasVerifiedExemption(orgId);
      reverseCharge = await isReverseCharge(orgId, sellerCountry ?? country);
    }

    const quote = calculateTax(amount, { country, region }, { exempt, reverseCharge });
    return c.json({ currency: currency.toUpperCase(), ...quote });
  } catch (err) {
    return internalError(c, logger, "Tax quote error", err);
  }
});

// GET /billing/vat/validate?vat=DE123456789 — EU VAT format + VIES check
router.get("/vat/validate", authMiddleware, async (c) => {
  try {
    const vat = c.req.query("vat");
    if (!vat) return c.json({ error: "INVALID_REQUEST", message: "vat query param required" }, 400);
    const result = await validateVatNumber(vat);
    return c.json(result);
  } catch (err) {
    return internalError(c, logger, "VAT validate error", err);
  }
});

const submitExemptionSchema = z.object({
  orgId: z.string().uuid(),
  kind: z.enum(["vat", "tax_id", "reverse_charge"]),
  taxId: z.string().min(2).max(64),
  country: z.string().min(2).max(2),
  businessName: z.string().max(200).optional(),
});

// POST /billing/tax-exemptions — submit a tax ID / VAT number (org owner/admin)
router.post(
  "/tax-exemptions",
  authMiddleware,
  orgRlsMiddleware({ allowQueryOrg: true }),
  async (c) => {
    try {
      const user = c.get("user");
      const body = await c.req.json().catch(() => ({}));
      const parsed = submitExemptionSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
      }
      if (!(await canManageOrg(parsed.data.orgId, user.id))) {
        return c.json({ error: "FORBIDDEN", message: "Org owner or admin required" }, 403);
      }

      const result = await submitTaxExemption({ ...parsed.data, submittedBy: user.id });
      if (!result.ok) {
        return c.json({ error: result.error, message: result.reason }, 400);
      }
      return c.json({ exemption: result.exemption }, 201);
    } catch (err) {
      return internalError(c, logger, "Submit exemption error", err);
    }
  }
);

// GET /billing/tax-exemptions?orgId=... — list an org's exemptions (member)
router.get(
  "/tax-exemptions",
  authMiddleware,
  orgRlsMiddleware({ allowQueryOrg: true }),
  async (c) => {
    try {
      const user = c.get("user");
      const orgId = c.req.query("orgId");
      if (!orgId) return c.json({ error: "INVALID_REQUEST", message: "orgId required" }, 400);
      if (!(await isOrgMember(orgId, user.id))) {
        return c.json({ error: "FORBIDDEN" }, 403);
      }
      const exemptions = await listTaxExemptions(orgId);
      return c.json({ exemptions });
    } catch (err) {
      return internalError(c, logger, "List exemptions error", err);
    }
  }
);

const statusSchema = z.object({ status: z.enum(["verified", "rejected", "pending"]) });

// POST /billing/tax-exemptions/:id/status — admin verifies/rejects an exemption
router.post("/tax-exemptions/:id/status", authMiddleware, async (c) => {
  try {
    const user = c.get("user");
    if (!isAdmin(user)) {
      return c.json({ error: "FORBIDDEN", message: "Admin role required" }, 403);
    }
    const body = await c.req.json().catch(() => ({}));
    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, 400);
    }
    const updated = await setExemptionStatus(c.req.param("id"), parsed.data.status);
    if (!updated) return c.json({ error: "NOT_FOUND" }, 404);
    return c.json({ exemption: updated });
  } catch (err) {
    return internalError(c, logger, "Set exemption status error", err);
  }
});

export default router;

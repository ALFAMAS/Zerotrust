import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock("../../../lib/api", () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

const mockNavigateToSafeExternal = vi.fn();
vi.mock("../../../lib/safeRedirect", () => ({
  navigateToSafeExternal: (...args: unknown[]) => mockNavigateToSafeExternal(...args),
}));

function mockSubscription(sub: Record<string, unknown> | null) {
  mockGet.mockImplementation((path: string) => {
    if (path === "/billing/subscription") {
      return sub ? Promise.resolve(sub) : Promise.reject(new Error("no subscription"));
    }
    if (path === "/billing/currencies") return Promise.resolve({ currencies: [] });
    if (path.startsWith("/billing/pricing")) return Promise.resolve({ plans: [] });
    return Promise.reject(new Error(`unexpected path ${path}`));
  });
}

// The Pro plan's Stripe price ID is read from NEXT_PUBLIC_STRIPE_PRICE_PRO at
// module-load time, so tests that depend on it being configured must stub the
// env var and re-import the module fresh (vi.resetModules), rather than rely
// on the top-level static import.
async function loadBillingPage() {
  const mod = await import("./page");
  return mod.default;
}

describe("BillingPage", () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
    mockNavigateToSafeExternal.mockReset();
    searchParams = new URLSearchParams();
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("renders all plan tiers", async () => {
    mockSubscription(null);
    const BillingPage = await loadBillingPage();
    render(<BillingPage />);

    expect(await screen.findByText("Free")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("Enterprise")).toBeInTheDocument();
  });

  it("does not show the paid-plan summary card on the free plan", async () => {
    mockSubscription(null);
    const BillingPage = await loadBillingPage();
    render(<BillingPage />);

    await screen.findByText("Free");
    // The summary card (with manage/cancel actions) only renders for paid
    // plans — the free tier's own "Current plan" button is a separate thing.
    expect(screen.queryByRole("button", { name: "Manage billing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel plan" })).not.toBeInTheDocument();
  });

  it("shows the current-plan card and cancel option for a paid plan", async () => {
    mockSubscription({
      plan: "pro",
      status: "active",
      currentPeriodEnd: "2026-08-01T00:00:00Z",
      cancelAtPeriodEnd: false,
      trialEnd: null,
    });
    const BillingPage = await loadBillingPage();
    render(<BillingPage />);

    expect(await screen.findByText("Current plan")).toBeInTheDocument();
    expect(screen.getByText("pro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel plan" })).toBeInTheDocument();
  });

  it("shows Reactivate instead of Cancel when the plan is set to cancel at period end", async () => {
    mockSubscription({
      plan: "pro",
      status: "active",
      currentPeriodEnd: "2026-08-01T00:00:00Z",
      cancelAtPeriodEnd: true,
      trialEnd: null,
    });
    const BillingPage = await loadBillingPage();
    render(<BillingPage />);

    expect(await screen.findByRole("button", { name: "Reactivate" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel plan" })).not.toBeInTheDocument();
  });

  it("opens the cancellation modal and requires a reason before confirming", async () => {
    mockSubscription({
      plan: "pro",
      status: "active",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      trialEnd: null,
    });
    const user = userEvent.setup();
    const BillingPage = await loadBillingPage();
    render(<BillingPage />);

    await user.click(await screen.findByRole("button", { name: "Cancel plan" }));

    expect(screen.getByText("Before you go…")).toBeInTheDocument();
    const confirmBtn = screen.getByRole("button", { name: "Cancel at period end" });
    expect(confirmBtn).toBeDisabled();

    await user.click(screen.getByLabelText("Too expensive"));
    expect(confirmBtn).toBeEnabled();
  });

  it("submits the cancellation with the selected reason", async () => {
    mockSubscription({
      plan: "pro",
      status: "active",
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      trialEnd: null,
    });
    mockPost.mockResolvedValue({});
    const user = userEvent.setup();
    const BillingPage = await loadBillingPage();
    render(<BillingPage />);

    await user.click(await screen.findByRole("button", { name: "Cancel plan" }));
    await user.click(screen.getByLabelText("No longer needed"));
    await user.click(screen.getByRole("button", { name: "Cancel at period end" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/billing/cancel", {
        action: "cancel",
        reason: "No longer needed",
        comment: "",
      });
    });
  });

  it("shows a disabled fallback (not an upgrade button) when no Stripe price is configured", async () => {
    mockSubscription(null);
    const BillingPage = await loadBillingPage();
    render(<BillingPage />);

    await screen.findByText("Pro");
    expect(screen.queryByRole("button", { name: "Upgrade to Pro" })).not.toBeInTheDocument();
  });

  it("starts checkout and redirects to the returned URL when a price is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PRICE_PRO", "price_pro_123");
    mockSubscription(null);
    mockPost.mockResolvedValue({ url: "https://checkout.stripe.com/session/abc" });
    const user = userEvent.setup();
    const BillingPage = await loadBillingPage();
    render(<BillingPage />);

    await user.click(await screen.findByRole("button", { name: "Upgrade to Pro" }));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith("/billing/checkout", { priceId: "price_pro_123" });
    });
    expect(mockNavigateToSafeExternal).toHaveBeenCalledWith(
      "https://checkout.stripe.com/session/abc",
      "/dashboard/billing"
    );
  });

  it("shows a success banner when redirected back with success=1", async () => {
    searchParams = new URLSearchParams("success=1");
    mockSubscription(null);
    const BillingPage = await loadBillingPage();
    render(<BillingPage />);

    expect(await screen.findByText("Subscription updated successfully!")).toBeInTheDocument();
  });
});

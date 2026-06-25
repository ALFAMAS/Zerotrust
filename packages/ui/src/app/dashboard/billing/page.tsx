"use client";

import { Check } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Modal from "../../../components/Modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { api } from "../../../lib/api";

interface Subscription {
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null;
}

const CANCEL_REASONS = [
  "Too expensive",
  "Missing features I need",
  "Switching to another product",
  "No longer needed",
  "Too hard to use",
  "Other",
];

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    period: "forever",
    features: ["Up to 2 API keys", "5 org members", "Basic auth flows", "Community support"],
    priceId: null,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$29",
    period: "/ month",
    features: [
      "20 API keys",
      "50 org members",
      "Custom roles",
      "Audit log",
      "Advanced MFA",
      "Email support",
    ],
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_PRO ?? null,
    highlighted: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "",
    features: ["Unlimited API keys", "Unlimited members", "SAML SSO", "Priority support", "SLA"],
    priceId: null,
    cta: "Contact us",
  },
];

function BillingContent() {
  const params = useSearchParams();
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelComment, setCancelComment] = useState("");
  const [cancelBusy, setCancelBusy] = useState(false);
  const [retentionOffer, setRetentionOffer] = useState<string | null>(null);

  // Multi-currency / PPP pricing (backend: /billing/currencies + /billing/pricing).
  const [currency, setCurrency] = useState("USD");
  const [currencies, setCurrencies] = useState<{ code: string; symbol: string; name: string }[]>(
    []
  );
  const [prices, setPrices] = useState<
    Record<string, { formatted: string; pppDiscountPercent: number }>
  >({});

  useEffect(() => {
    api
      .get<{ currencies: { code: string; symbol: string; name: string }[] }>("/billing/currencies")
      .then((r) => setCurrencies(r.currencies ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const locale = typeof navigator !== "undefined" ? navigator.language : "en-US";
    api
      .get<{ plans: { plan: string; formatted: string; pppDiscountPercent: number }[] }>(
        `/billing/pricing?currency=${currency}&locale=${encodeURIComponent(locale)}`
      )
      .then((r) => {
        const map: Record<string, { formatted: string; pppDiscountPercent: number }> = {};
        for (const p of r.plans ?? [])
          map[p.plan] = { formatted: p.formatted, pppDiscountPercent: p.pppDiscountPercent };
        setPrices(map);
      })
      .catch(() => {});
  }, [currency]);

  function loadSubscription() {
    api
      .get<Subscription>("/billing/subscription")
      .then(setSub)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(loadSubscription, []);

  async function handleCancel(action: "cancel" | "pause") {
    setCancelBusy(true);
    try {
      const res = await api.post<{ offer?: { code: string } }>("/billing/cancel", {
        action,
        reason: cancelReason,
        comment: cancelComment,
      });
      if (res.offer?.code) setRetentionOffer(res.offer.code);
      setCancelOpen(false);
      loadSubscription();
    } catch {
      alert("Failed to update subscription. Please try again.");
    } finally {
      setCancelBusy(false);
    }
  }

  async function handleReactivate() {
    try {
      await api.post("/billing/reactivate", {});
      loadSubscription();
    } catch {
      alert("Failed to reactivate subscription.");
    }
  }

  async function handleCheckout(priceId: string) {
    setCheckoutLoading(priceId);
    try {
      const { url } = await api.post<{ url: string }>("/billing/checkout", { priceId });
      window.location.href = url;
    } catch {
      alert("Failed to start checkout. Please try again.");
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function handlePortal() {
    setPortalLoading(true);
    try {
      const { url } = await api.post<{ url: string }>("/billing/portal", {});
      window.location.href = url;
    } catch {
      alert("Failed to open billing portal.");
    } finally {
      setPortalLoading(false);
    }
  }

  const currentPlan = sub?.plan ?? "free";

  return (
    <div className="max-w-4xl">
      <h1 className="mb-1 font-display text-2xl font-semibold tracking-tight text-foreground">
        Billing
      </h1>
      <p className="text-muted-foreground text-sm mb-8">
        Manage your subscription and payment details.
      </p>

      {params.get("success") === "1" && (
        <div className="mb-6 bg-green-900/30 border border-green-700 rounded-xl p-4 text-green-300 text-sm">
          Subscription updated successfully!
        </div>
      )}
      {params.get("canceled") === "1" && (
        <div className="mb-6 bg-yellow-900/30 border border-yellow-700 rounded-xl p-4 text-yellow-300 text-sm">
          Checkout canceled. You have not been charged.
        </div>
      )}

      {retentionOffer && (
        <div className="mb-6 bg-indigo-900/30 border border-indigo-700 rounded-xl p-4 text-indigo-200 text-sm">
          Sorry to see you go! Use code{" "}
          <span className="font-mono font-bold">{retentionOffer}</span> for a discount if you change
          your mind.
        </div>
      )}

      {!loading && sub && sub.plan !== "free" && (
        <div className="mb-8 bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Current plan</p>
              <p className="text-lg font-bold text-foreground capitalize mt-0.5">{sub.plan}</p>
              <p className="text-sm text-muted-foreground mt-1">
                Status: <span className="capitalize text-foreground/80">{sub.status}</span>
                {sub.trialEnd && new Date(sub.trialEnd) > new Date() && (
                  <span className="ml-2 text-blue-400">
                    Trial ends {new Date(sub.trialEnd).toLocaleDateString()}
                  </span>
                )}
                {sub.currentPeriodEnd && (
                  <> · Renews {new Date(sub.currentPeriodEnd).toLocaleDateString()}</>
                )}
                {sub.cancelAtPeriodEnd && (
                  <span className="ml-2 text-yellow-400">Cancels at period end</span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {sub.cancelAtPeriodEnd ? (
                <button
                  type="button"
                  onClick={handleReactivate}
                  className="px-4 py-2 bg-green-700 hover:bg-green-600 text-foreground text-sm rounded-lg transition-colors"
                >
                  Reactivate
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setCancelOpen(true)}
                  className="px-4 py-2 bg-muted hover:bg-accent text-foreground/80 text-sm rounded-lg transition-colors"
                >
                  Cancel plan
                </button>
              )}
              <button
                type="button"
                onClick={handlePortal}
                disabled={portalLoading}
                className="px-4 py-2 bg-secondary hover:bg-secondary/80 disabled:opacity-50 text-foreground text-sm rounded-lg transition-colors"
              >
                {portalLoading ? "Loading…" : "Manage billing"}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelOpen && (
        <Modal title="Before you go…" onClose={() => setCancelOpen(false)}>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Help us improve — why are you canceling?
            </p>
            <div className="space-y-2">
              {CANCEL_REASONS.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm text-foreground/80">
                  <input
                    type="radio"
                    name="cancel-reason"
                    checked={cancelReason === r}
                    onChange={() => setCancelReason(r)}
                    className="border-border bg-muted"
                  />
                  {r}
                </label>
              ))}
            </div>
            <textarea
              value={cancelComment}
              onChange={(e) => setCancelComment(e.target.value)}
              placeholder="Anything else you'd like us to know? (optional)"
              rows={2}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
            <div className="bg-muted/60 border border-border rounded-lg p-3">
              <p className="text-sm text-foreground/80">
                💡 Need a break instead? Pause your subscription — no charges until you resume, and
                your data stays put.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleCancel("pause")}
                disabled={cancelBusy}
                className="flex-1 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-foreground text-sm font-medium rounded-lg transition-colors"
              >
                Pause instead
              </button>
              <button
                type="button"
                onClick={() => handleCancel("cancel")}
                disabled={cancelBusy || !cancelReason}
                className="flex-1 py-2 bg-red-900/60 hover:bg-red-900 disabled:opacity-50 text-red-200 text-sm font-medium rounded-lg transition-colors"
              >
                {cancelBusy ? "Working…" : "Cancel at period end"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-foreground">Plans</h2>
        {currencies.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Currency</span>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {currencies.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.code} · {c.symbol}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const localized = prices[plan.id];
          const showLocalized = localized && plan.id !== "free" && plan.id !== "enterprise";
          return (
            <div
              key={plan.id}
              className={`bg-card border rounded-xl p-6 flex flex-col ${
                plan.highlighted ? "border-primary" : "border-border"
              }`}
            >
              {plan.highlighted && (
                <span className="text-xs font-medium text-primary mb-3">Most popular</span>
              )}
              <p className="font-display text-lg font-semibold text-foreground">{plan.name}</p>
              <p className="mt-1 mb-4">
                <span className="text-3xl font-bold text-foreground">
                  {showLocalized ? localized.formatted : plan.price}
                </span>
                {plan.period && (
                  <span className="text-muted-foreground text-sm ml-1">{plan.period}</span>
                )}
                {showLocalized && localized.pppDiscountPercent > 0 && (
                  <span className="ml-2 inline-block rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-medium text-emerald-400">
                    −{localized.pppDiscountPercent}% local pricing
                  </span>
                )}
              </p>
              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="text-sm text-foreground/80 flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <button
                  type="button"
                  disabled
                  className="py-2 rounded-lg text-sm font-medium bg-secondary text-muted-foreground cursor-default"
                >
                  Current plan
                </button>
              ) : plan.cta ? (
                <a
                  href="mailto:hello@example.com"
                  className="py-2 rounded-lg text-sm font-medium text-center bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
                >
                  {plan.cta}
                </a>
              ) : plan.priceId ? (
                <button
                  type="button"
                  onClick={() => handleCheckout(plan.priceId!)}
                  disabled={checkoutLoading === plan.priceId}
                  className={`py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                    plan.highlighted
                      ? "bg-primary hover:bg-primary/90 text-foreground"
                      : "bg-secondary hover:bg-secondary/80 text-foreground"
                  }`}
                >
                  {checkoutLoading === plan.priceId ? "Loading…" : `Upgrade to ${plan.name}`}
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="py-2 rounded-lg text-sm font-medium bg-secondary text-muted-foreground cursor-default"
                >
                  Free forever
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense>
      <BillingContent />
    </Suspense>
  );
}

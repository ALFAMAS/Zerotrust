"use client";

import { Check } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import Modal from "../../../components/Modal";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Textarea } from "../../../components/ui/textarea";
import { navigateToSafeExternal } from "../../../lib/safeRedirect";
import {
  useBillingCancelMutation,
  useBillingChangePlanMutation,
  useBillingCheckoutMutation,
  useBillingCurrenciesQuery,
  useBillingPortalMutation,
  useBillingPricingQuery,
  useBillingReactivateMutation,
  useBillingSubscriptionQuery,
  useBillingUsageQuery,
  useSubmitTaxExemptionMutation,
  useVatValidateQuery,
} from "../../../lib/server-state/billing";

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
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelComment, setCancelComment] = useState("");
  const [retentionOffer, setRetentionOffer] = useState<string | null>(null);

  const [currency, setCurrency] = useState("USD");
  const locale = typeof navigator !== "undefined" ? navigator.language : "en-US";
  const subscriptionQuery = useBillingSubscriptionQuery();
  const cancelMutation = useBillingCancelMutation();
  const reactivateMutation = useBillingReactivateMutation();
  const checkoutMutation = useBillingCheckoutMutation();
  const portalMutation = useBillingPortalMutation();
  const usageQuery = useBillingUsageQuery();
  const changePlanMutation = useBillingChangePlanMutation();
  const submitExemptionMutation = useSubmitTaxExemptionMutation();
  const [vatInput, setVatInput] = useState("");
  const [submittedVat, setSubmittedVat] = useState("");
  const vatQuery = useVatValidateQuery(submittedVat);
  const [exemptionForm, setExemptionForm] = useState({
    orgId: "",
    kind: "vat",
    taxId: "",
    country: "DE",
  });

  // Multi-currency / PPP pricing (backend: /billing/currencies + /billing/pricing).
  const currenciesQuery = useBillingCurrenciesQuery();
  const pricingQuery = useBillingPricingQuery(currency, locale);

  const sub = subscriptionQuery.data ?? null;
  const loading = subscriptionQuery.isPending;
  const currencies = currenciesQuery.data?.currencies ?? [];
  const prices = useMemo(() => {
    const map: Record<string, { formatted: string; pppDiscountPercent: number }> = {};
    for (const p of pricingQuery.data?.plans ?? []) {
      map[p.plan] = { formatted: p.formatted, pppDiscountPercent: p.pppDiscountPercent };
    }
    return map;
  }, [pricingQuery.data]);
  const checkoutLoading = checkoutMutation.isPending ? checkoutMutation.variables : null;
  const usage = usageQuery.data ?? null;

  async function handleChangePlan(priceId: string) {
    try {
      await changePlanMutation.mutateAsync({ priceId, when: "now" });
      alert("Plan change submitted.");
    } catch {
      alert("Failed to change plan.");
    }
  }

  async function handleSubmitExemption(e: React.FormEvent) {
    e.preventDefault();
    try {
      await submitExemptionMutation.mutateAsync(exemptionForm);
      alert("Tax exemption submitted for review.");
    } catch {
      alert("Failed to submit exemption.");
    }
  }

  async function handleCancel(action: "cancel" | "pause") {
    try {
      const res = await cancelMutation.mutateAsync({
        action,
        reason: cancelReason,
        comment: cancelComment,
      });
      if (res.offer?.code) setRetentionOffer(res.offer.code);
      setCancelOpen(false);
    } catch {
      alert("Failed to update subscription. Please try again.");
    }
  }

  async function handleReactivate() {
    try {
      await reactivateMutation.mutateAsync();
    } catch {
      alert("Failed to reactivate subscription.");
    }
  }

  async function handleCheckout(priceId: string) {
    try {
      const { url } = await checkoutMutation.mutateAsync(priceId);
      navigateToSafeExternal(url, "/dashboard/billing");
    } catch {
      alert("Failed to start checkout. Please try again.");
    }
  }

  async function handlePortal() {
    try {
      const { url } = await portalMutation.mutateAsync();
      navigateToSafeExternal(url, "/dashboard/billing");
    } catch {
      alert("Failed to open billing portal.");
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

      {usage && (
        <div className="mb-8 bg-card border border-border rounded-xl p-6">
          <h2 className="font-display text-lg font-semibold text-foreground mb-4">Usage</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">API calls</p>
              <p className="text-foreground font-medium">
                {usage.apiCalls.used} / {usage.apiCalls.limit}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Seats</p>
              <p className="text-foreground font-medium">
                {usage.seats.used} / {usage.seats.limit}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8 bg-card border border-border rounded-xl p-6 space-y-6">
        <h2 className="font-display text-lg font-semibold text-foreground">Tax &amp; VAT</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmittedVat(vatInput.trim());
          }}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="space-y-1.5 flex-1 min-w-[200px]">
            <label htmlFor="vat" className="text-sm text-muted-foreground">
              Validate EU VAT number
            </label>
            <Input
              id="vat"
              value={vatInput}
              onChange={(e) => setVatInput(e.target.value)}
              placeholder="DE123456789"
            />
          </div>
          <Button type="submit">Validate</Button>
        </form>
        {submittedVat && vatQuery.data && (
          <p className="text-sm text-muted-foreground">
            {vatQuery.data.valid ? "Valid" : "Invalid"} — format{" "}
            {vatQuery.data.formatValid ? "ok" : "bad"}
            {vatQuery.data.name ? ` · ${vatQuery.data.name}` : ""}
          </p>
        )}
        <form onSubmit={handleSubmitExemption} className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor="exOrgId" className="text-sm text-muted-foreground">
              Submit tax exemption (org owner/admin)
            </label>
            <Input
              id="exOrgId"
              value={exemptionForm.orgId}
              onChange={(e) => setExemptionForm((f) => ({ ...f, orgId: e.target.value }))}
              placeholder="Organization ID"
              required
            />
          </div>
          <Input
            value={exemptionForm.taxId}
            onChange={(e) => setExemptionForm((f) => ({ ...f, taxId: e.target.value }))}
            placeholder="Tax / VAT ID"
            required
          />
          <Input
            value={exemptionForm.country}
            onChange={(e) => setExemptionForm((f) => ({ ...f, country: e.target.value }))}
            placeholder="Country (ISO)"
            required
          />
          <div className="sm:col-span-2">
            <Button type="submit" disabled={submitExemptionMutation.isPending}>
              Submit exemption
            </Button>
          </div>
        </form>
      </div>

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
                <Button
                  type="button"
                  onClick={handleReactivate}
                  className="px-4 py-2 bg-green-700 hover:bg-green-600 text-foreground text-sm rounded-lg transition-colors"
                >
                  Reactivate
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={() => setCancelOpen(true)}
                  className="px-4 py-2 bg-muted hover:bg-accent text-foreground/80 text-sm rounded-lg transition-colors"
                >
                  Cancel plan
                </Button>
              )}
              <Button
                type="button"
                onClick={handlePortal}
                disabled={portalMutation.isPending}
                className="px-4 py-2 bg-secondary hover:bg-secondary/80 disabled:opacity-50 text-foreground text-sm rounded-lg transition-colors"
              >
                {portalMutation.isPending ? "Loading…" : "Manage billing"}
              </Button>
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
                <label
                  key={r}
                  htmlFor={`cancel-reason-${r}`}
                  className="flex items-center gap-2 text-sm text-foreground/80"
                >
                  <Input
                    id={`cancel-reason-${r}`}
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
            <Textarea
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
              <Button
                type="button"
                onClick={() => handleCancel("pause")}
                disabled={cancelMutation.isPending}
                className="flex-1 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-foreground text-sm font-medium rounded-lg transition-colors"
              >
                Pause instead
              </Button>
              <Button
                type="button"
                onClick={() => handleCancel("cancel")}
                disabled={cancelMutation.isPending || !cancelReason}
                className="flex-1 py-2 bg-red-900/60 hover:bg-red-900 disabled:opacity-50 text-red-200 text-sm font-medium rounded-lg transition-colors"
              >
                {cancelMutation.isPending ? "Working…" : "Cancel at period end"}
              </Button>
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
                <Button
                  type="button"
                  disabled
                  className="py-2 rounded-lg text-sm font-medium bg-secondary text-muted-foreground cursor-default"
                >
                  Current plan
                </Button>
              ) : plan.cta ? (
                <a
                  href="mailto:hello@example.com"
                  className="py-2 rounded-lg text-sm font-medium text-center bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
                >
                  {plan.cta}
                </a>
              ) : plan.priceId ? (
                <Button
                  type="button"
                  onClick={() => {
                    if (sub && sub.plan !== "free" && sub.status !== "canceled") {
                      void handleChangePlan(plan.priceId!);
                    } else {
                      void handleCheckout(plan.priceId!);
                    }
                  }}
                  disabled={checkoutLoading === plan.priceId || changePlanMutation.isPending}
                  className={`py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                    plan.highlighted
                      ? "bg-primary hover:bg-primary/90 text-foreground"
                      : "bg-secondary hover:bg-secondary/80 text-foreground"
                  }`}
                >
                  {checkoutLoading === plan.priceId ? "Loading…" : `Upgrade to ${plan.name}`}
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled
                  className="py-2 rounded-lg text-sm font-medium bg-secondary text-muted-foreground cursor-default"
                >
                  Free forever
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function BillingClient() {
  return (
    <Suspense>
      <BillingContent />
    </Suspense>
  );
}

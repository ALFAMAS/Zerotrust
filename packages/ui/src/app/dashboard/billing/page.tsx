"use client";

import { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

interface Subscription {
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null;
}

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

  useEffect(() => {
    api
      .get<Subscription>("/billing/subscription")
      .then(setSub)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
      <h1 className="text-2xl font-bold text-white mb-1">Billing</h1>
      <p className="text-gray-400 text-sm mb-8">Manage your subscription and payment details.</p>

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

      {!loading && sub && sub.plan !== "free" && (
        <div className="mb-8 bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Current plan</p>
              <p className="text-lg font-bold text-white capitalize mt-0.5">{sub.plan}</p>
              <p className="text-sm text-gray-500 mt-1">
                Status: <span className="capitalize text-gray-300">{sub.status}</span>
                {sub.currentPeriodEnd && (
                  <> · Renews {new Date(sub.currentPeriodEnd).toLocaleDateString()}</>
                )}
                {sub.cancelAtPeriodEnd && (
                  <span className="ml-2 text-yellow-400">Cancels at period end</span>
                )}
              </p>
            </div>
            <button
              onClick={handlePortal}
              disabled={portalLoading}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
            >
              {portalLoading ? "Loading…" : "Manage billing"}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          return (
            <div
              key={plan.id}
              className={`bg-gray-900 border rounded-xl p-6 flex flex-col ${
                plan.highlighted ? "border-indigo-500" : "border-gray-800"
              }`}
            >
              {plan.highlighted && (
                <span className="text-xs font-medium text-indigo-400 mb-3">Most popular</span>
              )}
              <p className="font-bold text-white text-lg">{plan.name}</p>
              <p className="mt-1 mb-4">
                <span className="text-3xl font-bold text-white">{plan.price}</span>
                {plan.period && <span className="text-gray-400 text-sm ml-1">{plan.period}</span>}
              </p>
              <ul className="space-y-2 mb-6 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="text-sm text-gray-300 flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <button
                  disabled
                  className="py-2 rounded-lg text-sm font-medium bg-gray-700 text-gray-400 cursor-default"
                >
                  Current plan
                </button>
              ) : plan.cta ? (
                <a
                  href="mailto:hello@example.com"
                  className="py-2 rounded-lg text-sm font-medium text-center bg-gray-700 hover:bg-gray-600 text-white transition-colors"
                >
                  {plan.cta}
                </a>
              ) : plan.priceId ? (
                <button
                  onClick={() => handleCheckout(plan.priceId!)}
                  disabled={checkoutLoading === plan.priceId}
                  className={`py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                    plan.highlighted
                      ? "bg-indigo-600 hover:bg-indigo-500 text-white"
                      : "bg-gray-700 hover:bg-gray-600 text-white"
                  }`}
                >
                  {checkoutLoading === plan.priceId ? "Loading…" : `Upgrade to ${plan.name}`}
                </button>
              ) : (
                <button
                  disabled
                  className="py-2 rounded-lg text-sm font-medium bg-gray-700 text-gray-400 cursor-default"
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

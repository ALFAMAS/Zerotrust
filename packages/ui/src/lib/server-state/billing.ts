"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";

export interface BillingSubscription {
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEnd: string | null;
}

export interface BillingCurrency {
  code: string;
  symbol: string;
  name: string;
}

export interface BillingPlanPrice {
  plan: string;
  formatted: string;
  pppDiscountPercent: number;
}

export interface BillingCancelInput {
  action: "cancel" | "pause";
  reason: string;
  comment: string;
}

export const billingKeys = queryKeys.billing;

export function buildBillingPricingPath(currency: string, locale: string): string {
  const search = new URLSearchParams({ currency, locale });
  return `/billing/pricing?${search.toString()}`;
}

export function fetchBillingSubscription(): Promise<BillingSubscription> {
  return apiGet<BillingSubscription>("/billing/subscription");
}

export function fetchBillingCurrencies(): Promise<{ currencies: BillingCurrency[] }> {
  return apiGet<{ currencies: BillingCurrency[] }>("/billing/currencies");
}

export function fetchBillingPricing(
  currency: string,
  locale: string
): Promise<{ plans: BillingPlanPrice[] }> {
  return apiGet<{ plans: BillingPlanPrice[] }>(buildBillingPricingPath(currency, locale));
}

export function billingSubscriptionQueryOptions() {
  return queryOptions({
    queryKey: billingKeys.subscription(),
    queryFn: fetchBillingSubscription,
  });
}

export function billingCurrenciesQueryOptions() {
  return queryOptions({
    queryKey: billingKeys.currencies(),
    queryFn: fetchBillingCurrencies,
  });
}

export function billingPricingQueryOptions(currency: string, locale: string) {
  return queryOptions({
    queryKey: billingKeys.pricing(currency, locale),
    queryFn: () => fetchBillingPricing(currency, locale),
  });
}

export function useBillingSubscriptionQuery() {
  return useQuery(billingSubscriptionQueryOptions());
}

export function useBillingCurrenciesQuery() {
  return useQuery(billingCurrenciesQueryOptions());
}

export function useBillingPricingQuery(currency: string, locale: string) {
  return useQuery(billingPricingQueryOptions(currency, locale));
}

export function useBillingCancelMutation() {
  const queryClient = useQueryClient();
  return useMutation<{ offer?: { code: string } }, Error, BillingCancelInput>({
    mutationFn: (input) => apiPost("/billing/cancel", input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: billingKeys.subscription() });
    },
  });
}

export function useBillingReactivateMutation() {
  const queryClient = useQueryClient();
  return useMutation<unknown, Error, void>({
    mutationFn: () => apiPost("/billing/reactivate", {}),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: billingKeys.subscription() });
    },
  });
}

export function useBillingCheckoutMutation() {
  return useMutation<{ url: string }, Error, string>({
    mutationFn: (priceId) => apiPost("/billing/checkout", { priceId }),
  });
}

export function useBillingPortalMutation() {
  return useMutation<{ url: string }, Error, void>({
    mutationFn: () => apiPost("/billing/portal", {}),
  });
}

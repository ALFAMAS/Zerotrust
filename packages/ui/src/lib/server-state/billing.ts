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

export interface BillingUsageMetric {
  used: number;
  limit: number;
}

/** Matches GET /billing/usage (`UsageSummary` in usage.service.ts). */
export interface BillingUsageSummary {
  period: string;
  metrics: {
    api_calls?: BillingUsageMetric;
    seats?: BillingUsageMetric;
    storage_bytes?: BillingUsageMetric;
  };
}

export interface TaxExemption {
  id: string;
  orgId: string;
  kind: string;
  taxId: string;
  country: string;
  status: string;
  businessName: string | null;
  createdAt: string;
}

export interface VatValidationResult {
  valid: boolean;
  country: string;
  vatNumber: string;
  name?: string;
  address?: string;
  formatValid: boolean;
  viesChecked: boolean;
}

export function fetchBillingUsage(orgId?: string): Promise<BillingUsageSummary> {
  const path = orgId ? `/billing/usage?orgId=${encodeURIComponent(orgId)}` : "/billing/usage";
  return apiGet<BillingUsageSummary>(path);
}

export function billingUsageQueryOptions(orgId?: string) {
  return queryOptions({
    queryKey: billingKeys.usage(orgId),
    queryFn: () => fetchBillingUsage(orgId),
  });
}

export function useBillingUsageQuery(orgId?: string) {
  return useQuery(billingUsageQueryOptions(orgId));
}

export function fetchTaxExemptions(orgId: string): Promise<{ exemptions: TaxExemption[] }> {
  return apiGet<{ exemptions: TaxExemption[] }>(
    `/billing/tax-exemptions?orgId=${encodeURIComponent(orgId)}`
  );
}

export function taxExemptionsQueryOptions(orgId: string) {
  return queryOptions({
    queryKey: billingKeys.taxExemptions(orgId),
    queryFn: () => fetchTaxExemptions(orgId),
    enabled: Boolean(orgId),
  });
}

export function useTaxExemptionsQuery(orgId: string) {
  return useQuery(taxExemptionsQueryOptions(orgId));
}

export function useSubmitTaxExemptionMutation() {
  const queryClient = useQueryClient();
  return useMutation<
    unknown,
    Error,
    { orgId: string; kind: string; taxId: string; country: string; businessName?: string }
  >({
    mutationFn: (input) => apiPost("/billing/tax-exemptions", input),
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({
        queryKey: billingKeys.taxExemptions(variables.orgId),
      });
    },
  });
}

export function useSetTaxExemptionStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation<
    unknown,
    Error,
    { id: string; status: "verified" | "rejected" | "pending"; orgId: string }
  >({
    mutationFn: ({ id, status }) => apiPost(`/billing/tax-exemptions/${id}/status`, { status }),
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({
        queryKey: billingKeys.taxExemptions(variables.orgId),
      });
    },
  });
}

export function fetchVatValidation(vat: string): Promise<VatValidationResult> {
  return apiGet<VatValidationResult>(`/billing/vat/validate?vat=${encodeURIComponent(vat)}`);
}

export function vatValidateQueryOptions(vat: string) {
  return queryOptions({
    queryKey: billingKeys.vatValidate(vat),
    queryFn: () => fetchVatValidation(vat),
    enabled: vat.length >= 4,
  });
}

export function useVatValidateQuery(vat: string) {
  return useQuery(vatValidateQueryOptions(vat));
}

export function useBillingChangePlanMutation() {
  const queryClient = useQueryClient();
  return useMutation<
    unknown,
    Error,
    { priceId: string; orgId?: string; when?: "now" | "period_end" }
  >({
    mutationFn: (input) => apiPost("/billing/change-plan", input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: billingKeys.subscription() });
      void queryClient.invalidateQueries({ queryKey: billingKeys.usage() });
    },
  });
}

/**
 * TanStack Query options for server-side prefetch (P3.4 / P3.6).
 *
 * Kept separate from `"use client"` server-state modules so RSC page.tsx
 * files can import queryOptions + fetchers without crossing the client boundary.
 */

import { queryOptions } from "@tanstack/react-query";
import { serverApiGet } from "@/lib/serverApiClient";
import { queryKeys } from "./queryKeys";
import type {
  AdminRecentUser,
  AdminSession,
  AdminStats,
  AdminUserListItem,
  AuthMe,
  PaginatedResponse,
  UserSession,
  Wallet,
  WalletTransaction,
} from "./types";

export const AUTH_ME_PATH = "/auth/me";
export const USER_SESSIONS_PATH = "/sessions";
export const ADMIN_STATS_PATH = "/admin/stats";
export const WALLET_PATH = "/wallet";
export const BILLING_SUBSCRIPTION_PATH = "/billing/subscription";
export const BILLING_CURRENCIES_PATH = "/billing/currencies";

const DEFAULT_TRANSACTION_LIMIT = 30;
const DEFAULT_ADMIN_LIST_LIMIT = 20;
const DEFAULT_PREFETCH_CURRENCY = "USD";
const DEFAULT_PREFETCH_LOCALE = "en-US";

export function buildWalletTransactionPath(limit = DEFAULT_TRANSACTION_LIMIT): string {
  return `/wallet/transactions?limit=${limit}`;
}

export function buildBillingPricingPath(
  currency = DEFAULT_PREFETCH_CURRENCY,
  locale = DEFAULT_PREFETCH_LOCALE
): string {
  const search = new URLSearchParams({ currency, locale });
  return `/billing/pricing?${search.toString()}`;
}

export function buildAdminRecentUsersPath(limit = 5): string {
  return `/admin/users?limit=${limit}`;
}

export function buildAdminUsersListPath(
  params: { page?: number; limit?: number; search?: string; status?: string } = {}
): string {
  const search = new URLSearchParams();
  const page = params.page ?? 1;
  const limit = params.limit ?? DEFAULT_ADMIN_LIST_LIMIT;
  search.set("page", String(page));
  search.set("limit", String(limit));
  if (params.search) search.set("search", params.search);
  if (params.status && params.status !== "all") search.set("status", params.status);
  return `/admin/users?${search.toString()}`;
}

export function buildAdminSessionsListPath(params: { page?: number; limit?: number } = {}): string {
  const search = new URLSearchParams();
  const page = params.page ?? 1;
  const limit = params.limit ?? DEFAULT_ADMIN_LIST_LIMIT;
  search.set("page", String(page));
  search.set("limit", String(limit));
  return `/admin/sessions?${search.toString()}`;
}

function normalizeUserSessionsList(data: unknown): UserSession[] {
  if (Array.isArray(data)) return data;
  const record = data as { data?: UserSession[]; sessions?: UserSession[] };
  return record.data ?? record.sessions ?? [];
}

function normalizeRecentUsers(
  data: PaginatedResponse<AdminRecentUser> | AdminRecentUser[] | { users: AdminRecentUser[] }
): AdminRecentUser[] {
  if (Array.isArray(data)) return data;
  if ("users" in data && Array.isArray(data.users)) return data.users;
  if ("data" in data && Array.isArray(data.data)) return data.data;
  return [];
}

function normalizeAdminUsersListParams(
  params: { page?: number; limit?: number; search?: string; status?: string } = {}
) {
  return {
    page: params.page ?? 1,
    limit: params.limit ?? DEFAULT_ADMIN_LIST_LIMIT,
    ...params,
  };
}

function normalizeAdminSessionsListParams(params: { page?: number; limit?: number } = {}) {
  return {
    page: params.page ?? 1,
    limit: params.limit ?? DEFAULT_ADMIN_LIST_LIMIT,
    ...params,
  };
}

export function authMePrefetchOptions() {
  return queryOptions({
    queryKey: queryKeys.auth.me(),
    queryFn: () => serverApiGet<AuthMe>(AUTH_ME_PATH),
  });
}

export function userSessionsPrefetchOptions() {
  return queryOptions({
    queryKey: queryKeys.sessions.list(),
    queryFn: () => serverApiGet<unknown>(USER_SESSIONS_PATH).then(normalizeUserSessionsList),
  });
}

export function adminStatsPrefetchOptions() {
  return queryOptions({
    queryKey: queryKeys.admin.stats(),
    queryFn: () => serverApiGet<AdminStats>(ADMIN_STATS_PATH),
  });
}

export function adminRecentUsersPrefetchOptions(limit = 5) {
  return queryOptions({
    queryKey: [...queryKeys.admin.stats(), "recentUsers", { limit }] as const,
    queryFn: () =>
      serverApiGet<
        PaginatedResponse<AdminRecentUser> | AdminRecentUser[] | { users: AdminRecentUser[] }
      >(buildAdminRecentUsersPath(limit)).then(normalizeRecentUsers),
  });
}

export function walletPrefetchOptions() {
  return queryOptions({
    queryKey: queryKeys.wallet.detail(),
    queryFn: () => serverApiGet<Wallet>(WALLET_PATH),
  });
}

export function walletTransactionsPrefetchOptions(limit = DEFAULT_TRANSACTION_LIMIT) {
  const params = { limit };
  return queryOptions({
    queryKey: queryKeys.wallet.transactions(params),
    queryFn: () =>
      serverApiGet<PaginatedResponse<WalletTransaction>>(buildWalletTransactionPath(limit)),
  });
}

export function billingSubscriptionPrefetchOptions() {
  return queryOptions({
    queryKey: queryKeys.billing.subscription(),
    queryFn: () => serverApiGet<{ plan: string; status: string }>(BILLING_SUBSCRIPTION_PATH),
  });
}

export function billingCurrenciesPrefetchOptions() {
  return queryOptions({
    queryKey: queryKeys.billing.currencies(),
    queryFn: () =>
      serverApiGet<{ currencies: Array<{ code: string; symbol: string; name: string }> }>(
        BILLING_CURRENCIES_PATH
      ),
  });
}

export function billingPricingPrefetchOptions(
  currency = DEFAULT_PREFETCH_CURRENCY,
  locale = DEFAULT_PREFETCH_LOCALE
) {
  return queryOptions({
    queryKey: queryKeys.billing.pricing(currency, locale),
    queryFn: () =>
      serverApiGet<{
        plans: Array<{ plan: string; formatted: string; pppDiscountPercent: number }>;
      }>(buildBillingPricingPath(currency, locale)),
  });
}

export function adminUsersListPrefetchOptions(
  params: { page?: number; limit?: number; search?: string; status?: string } = {}
) {
  const normalized = normalizeAdminUsersListParams(params);
  return queryOptions({
    queryKey: queryKeys.admin.users.list(
      normalized as unknown as Record<string, string | number | undefined>
    ),
    queryFn: () =>
      serverApiGet<PaginatedResponse<AdminUserListItem>>(buildAdminUsersListPath(normalized)),
  });
}

export function adminSessionsListPrefetchOptions(params: { page?: number; limit?: number } = {}) {
  const normalized = normalizeAdminSessionsListParams(params);
  return queryOptions({
    queryKey: queryKeys.admin.sessions.list(normalized),
    queryFn: () =>
      serverApiGet<PaginatedResponse<AdminSession>>(buildAdminSessionsListPath(normalized)),
  });
}

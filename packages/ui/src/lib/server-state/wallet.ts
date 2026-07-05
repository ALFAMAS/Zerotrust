"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type {
  PaginatedResponse,
  Wallet,
  WalletTransaction,
  WalletTransactionsParams,
} from "./types";

const DEFAULT_TRANSACTION_LIMIT = 30;

export const walletKeys = queryKeys.wallet;

export interface WalletTopUpCheckout {
  url: string;
  sessionId: string;
}

export function buildWalletTransactionPath(params: WalletTransactionsParams = {}): string {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  search.set("limit", String(params.limit ?? DEFAULT_TRANSACTION_LIMIT));
  return `/wallet/transactions?${search.toString()}`;
}

export function fetchWallet(): Promise<Wallet> {
  return apiGet<Wallet>("/wallet");
}

export function fetchWalletTransactions(
  params: WalletTransactionsParams = {}
): Promise<PaginatedResponse<WalletTransaction>> {
  return apiGet<PaginatedResponse<WalletTransaction>>(buildWalletTransactionPath(params));
}

export function walletQueryOptions() {
  return queryOptions({
    queryKey: walletKeys.detail(),
    queryFn: fetchWallet,
  });
}

export function walletTransactionsQueryOptions(params: WalletTransactionsParams = {}) {
  const normalized = { limit: params.limit ?? DEFAULT_TRANSACTION_LIMIT, page: params.page };
  return queryOptions({
    queryKey: walletKeys.transactions(normalized),
    queryFn: () => fetchWalletTransactions(normalized),
  });
}

export function useWalletQuery() {
  return useQuery(walletQueryOptions());
}

export function useWalletTransactionsQuery(params: WalletTransactionsParams = {}) {
  return useQuery(walletTransactionsQueryOptions(params));
}

export function useTopUpWalletMutation() {
  const queryClient = useQueryClient();

  return useMutation<WalletTopUpCheckout, Error, number>({
    mutationFn: (amountCents) =>
      apiPost<WalletTopUpCheckout>("/wallet/top-up", { amount: amountCents }),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: walletKeys.detail() });
      void queryClient.invalidateQueries({ queryKey: walletKeys.transactions() });
    },
  });
}

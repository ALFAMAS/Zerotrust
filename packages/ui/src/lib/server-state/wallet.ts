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

export function optimisticTopUpTransaction(wallet: Wallet, amountCents: number): WalletTransaction {
  return {
    id: `optimistic-top-up-${amountCents}`,
    amount: amountCents,
    balanceAfter: wallet.balance + amountCents,
    type: "top_up",
    description: "Top-up pending confirmation",
    createdAt: new Date().toISOString(),
    optimistic: true,
  };
}

export function useWalletQuery() {
  return useQuery(walletQueryOptions());
}

export function useWalletTransactionsQuery(params: WalletTransactionsParams = {}) {
  return useQuery(walletTransactionsQueryOptions(params));
}

interface TopUpContext {
  previousWallet?: Wallet;
  previousTransactions: Array<
    readonly [readonly unknown[], PaginatedResponse<WalletTransaction> | undefined]
  >;
}

export function useTopUpWalletMutation() {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, number, TopUpContext>({
    mutationFn: (amountCents) => apiPost("/wallet/top-up", { amount: amountCents }),
    onMutate: async (amountCents) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: walletKeys.detail() }),
        queryClient.cancelQueries({ queryKey: walletKeys.transactions() }),
      ]);

      const previousWallet = queryClient.getQueryData<Wallet>(walletKeys.detail());
      const previousTransactions = queryClient.getQueriesData<PaginatedResponse<WalletTransaction>>(
        {
          queryKey: walletKeys.transactions(),
        }
      );

      if (previousWallet) {
        const nextWallet: Wallet = {
          ...previousWallet,
          balance: previousWallet.balance + amountCents,
          lifetimeBalance: previousWallet.lifetimeBalance + amountCents,
        };
        queryClient.setQueryData(walletKeys.detail(), nextWallet);

        const optimisticTx = optimisticTopUpTransaction(previousWallet, amountCents);
        queryClient.setQueriesData<PaginatedResponse<WalletTransaction>>(
          { queryKey: walletKeys.transactions() },
          (current) => {
            if (!current) return current;
            return {
              ...current,
              data: [optimisticTx, ...(current.data ?? [])],
            };
          }
        );
      }

      return { previousWallet, previousTransactions };
    },
    onError: (_error, _amountCents, context) => {
      if (context?.previousWallet) {
        queryClient.setQueryData(walletKeys.detail(), context.previousWallet);
      }
      for (const [queryKey, data] of context?.previousTransactions ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: walletKeys.detail() });
      void queryClient.invalidateQueries({ queryKey: walletKeys.transactions() });
    },
  });
}

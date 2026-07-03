"use client";

import { Wallet as WalletIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, ErrorState } from "@/components/ui/States";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { navigateToSafeExternal } from "@/lib/safeRedirect";
import {
  useTopUpWalletMutation,
  useWalletQuery,
  useWalletTransactionsQuery,
} from "@/lib/server-state/wallet";

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : "—");
const money = (cents: number, currency = "USD") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format((cents ?? 0) / 100);

function WalletContent() {
  const params = useSearchParams();
  const walletQuery = useWalletQuery();
  const transactionsQuery = useWalletTransactionsQuery({ limit: 30 });
  const topUpMutation = useTopUpWalletMutation();
  const [toast, setToast] = useState<string | null>(null);
  const [amount, setAmount] = useState("10");

  const wallet = walletQuery.data ?? null;
  const txs = transactionsQuery.data?.data ?? [];
  const currency = wallet?.currency ?? "USD";
  const isInitialLoading = walletQuery.isPending || transactionsQuery.isPending;
  const error = walletQuery.error ?? transactionsQuery.error;
  const isRefetching =
    (walletQuery.isFetching && !walletQuery.isPending) ||
    (transactionsQuery.isFetching && !transactionsQuery.isPending);
  const isStale = walletQuery.isStale || transactionsQuery.isStale;

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  function refreshWallet() {
    void walletQuery.refetch();
    void transactionsQuery.refetch();
  }

  async function handleTopUp(e: React.FormEvent) {
    e.preventDefault();
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      showToast("Enter a positive amount");
      return;
    }

    const amountCents = Math.round(dollars * 100);
    try {
      const { url } = await topUpMutation.mutateAsync(amountCents);
      navigateToSafeExternal(url, "/dashboard/wallet");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Top-up failed");
    }
  }

  if (error && !wallet && txs.length === 0) {
    return (
      <div className="space-y-6">
        <WalletHeader />
        <ErrorState message={error.message} retry={refreshWallet} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground shadow-lg">
          {toast}
        </div>
      )}

      <WalletHeader />

      {params.get("success") === "1" && (
        <div className="rounded-xl border border-green-700 bg-green-900/30 p-4 text-sm text-green-300">
          Payment received. Your wallet balance will update shortly after Stripe confirms the
          payment.
        </div>
      )}
      {params.get("canceled") === "1" && (
        <div className="rounded-xl border border-yellow-700 bg-yellow-900/30 p-4 text-sm text-yellow-300">
          Checkout canceled. You have not been charged.
        </div>
      )}

      <ServerStateStatus
        isFetching={isRefetching}
        isStale={isStale}
        hasData={Boolean(wallet)}
        label="wallet data"
        onRefresh={refreshWallet}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Current balance</CardDescription>
            <CardTitle className="text-3xl">
              {isInitialLoading ? "…" : money(wallet?.balance ?? 0, currency)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Lifetime added: {money(wallet?.lifetimeBalance ?? 0, currency)}
              {wallet?.autoTopUp && (
                <Badge variant="secondary" className="ml-2">
                  auto-top-up on
                </Badge>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add funds</CardTitle>
            <CardDescription>Pay securely with Stripe to add account credit.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleTopUp} className="flex items-end gap-3">
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="amount">Amount ({currency})</Label>
                <Input
                  id="amount"
                  type="number"
                  min={1}
                  step="1"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={topUpMutation.isPending || !wallet}>
                {topUpMutation.isPending ? "Redirecting…" : "Pay with Stripe"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transactions</CardTitle>
          <CardDescription>Most recent wallet activity.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isInitialLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Loading wallet…
                    </TableCell>
                  </TableRow>
                )}
                {!isInitialLoading && txs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <EmptyState
                        title="No transactions yet."
                        description="Top up your wallet to see account-credit activity here."
                      />
                    </TableCell>
                  </TableRow>
                )}
                {!isInitialLoading &&
                  txs.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmt(tx.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{tx.type.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {tx.description ?? "—"}
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium ${tx.amount < 0 ? "text-destructive" : "text-emerald-600"}`}
                      >
                        {tx.amount < 0 ? "-" : "+"}
                        {money(Math.abs(tx.amount), currency)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {money(tx.balanceAfter, currency)}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function WalletClient() {
  return (
    <Suspense>
      <WalletContent />
    </Suspense>
  );
}

function WalletHeader() {
  return (
    <div className="flex items-center gap-3">
      <WalletIcon className="h-6 w-6 text-primary" />
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Wallet
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your account credit balance and transaction history.
        </p>
      </div>
    </div>
  );
}

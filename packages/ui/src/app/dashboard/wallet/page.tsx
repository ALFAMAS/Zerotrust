"use client";

import { Wallet as WalletIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";

interface Wallet {
  balance: number;
  lifetimeBalance: number;
  currency: string;
  autoTopUp: boolean;
}

interface WalletTx {
  id: string;
  amount: number;
  balanceAfter: number;
  type: string;
  description?: string | null;
  createdAt?: string;
}

const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString() : "—");
const money = (cents: number, currency = "USD") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format((cents ?? 0) / 100);

export default function WalletPage() {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [txs, setTxs] = useState<WalletTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [amount, setAmount] = useState("10");
  const [topping, setTopping] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, t] = await Promise.all([
        api.get<Wallet>("/wallet"),
        api.get<{ data: WalletTx[]; pagination: any }>("/wallet/transactions?limit=30"),
      ]);
      setWallet(w);
      setTxs(t.data ?? []);
    } catch {
      showToast("Failed to load wallet");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleTopUp(e: React.FormEvent) {
    e.preventDefault();
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars <= 0) {
      showToast("Enter a positive amount");
      return;
    }
    setTopping(true);
    try {
      // Wallet amounts are integer cents.
      await api.post("/wallet/top-up", { amount: Math.round(dollars * 100) });
      showToast(`Added ${money(Math.round(dollars * 100), wallet?.currency)}`);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Top-up failed");
    } finally {
      setTopping(false);
    }
  }

  const currency = wallet?.currency ?? "USD";

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground shadow-lg">
          {toast}
        </div>
      )}

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

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>Current balance</CardDescription>
            <CardTitle className="text-3xl">
              {loading ? "…" : money(wallet?.balance ?? 0, currency)}
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
            <CardDescription>Top up your account credit.</CardDescription>
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
              <Button type="submit" disabled={topping}>
                {topping ? "Adding…" : "Top up"}
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
                {loading && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {!loading && txs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No transactions yet.
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
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

"use client";

import { Building2, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorState } from "@/components/ui/States";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useChangeTenantPlanMutation,
  useCreateTenantMutation,
  useDeleteTenantMutation,
  useTenantsQuery,
  useUpdateTenantStatusMutation,
} from "@/lib/server-state/tenants";
import type { Tenant, TenantPlan, TenantStatus } from "@/lib/server-state/types";

const LIST_PARAMS = { limit: 100 } as const;
const PLANS: TenantPlan[] = ["free", "starter", "pro", "enterprise"];
const STATUS_VARIANT: Record<string, "success" | "warning" | "secondary" | "destructive"> = {
  active: "success",
  trial: "warning",
  suspended: "secondary",
  deleted: "destructive",
};

export default function TenantsPage() {
  const tenantsQuery = useTenantsQuery(LIST_PARAMS);
  const createMutation = useCreateTenantMutation(LIST_PARAMS);
  const changePlanMutation = useChangeTenantPlanMutation(LIST_PARAMS);
  const updateStatusMutation = useUpdateTenantStatusMutation(LIST_PARAMS);
  const deleteMutation = useDeleteTenantMutation(LIST_PARAMS);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState<{ slug: string; name: string; plan: TenantPlan }>({
    slug: "",
    name: "",
    plan: "free",
  });

  const tenants = tenantsQuery.data?.tenants ?? [];
  const hasTenants = tenants.length > 0;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createMutation.mutateAsync({
        slug: form.slug.trim(),
        name: form.name.trim(),
        plan: form.plan,
      });
      setForm({ slug: "", name: "", plan: "free" });
      showToast("Tenant created");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create tenant");
    }
  }

  async function changePlan(t: Tenant, plan: TenantPlan) {
    try {
      await changePlanMutation.mutateAsync({ id: t.id, plan });
      showToast(`${t.slug} → ${plan}`);
    } catch {
      showToast("Failed to change plan");
    }
  }

  async function toggleSuspend(t: Tenant) {
    const status: TenantStatus = t.status === "suspended" ? "active" : "suspended";
    try {
      await updateStatusMutation.mutateAsync({ id: t.id, status });
      showToast(`${t.slug} ${status}`);
    } catch {
      showToast("Failed to update status");
    }
  }

  async function remove(t: Tenant) {
    try {
      await deleteMutation.mutateAsync(t.id);
      showToast("Tenant deleted");
    } catch {
      showToast("Failed to delete tenant");
    }
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Building2 className="h-6 w-6 text-primary" />
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Tenants
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage tenant organizations, plans, and lifecycle status.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create tenant</CardTitle>
          <CardDescription>Provision a new tenant with a unique slug.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="acme-inc"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Acme Inc"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan">Plan</Label>
              <Select
                value={form.plan}
                onValueChange={(v) => setForm((f) => ({ ...f, plan: v as TenantPlan }))}
              >
                <SelectTrigger id="plan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLANS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={createMutation.isPending} className="w-full">
                {createMutation.isPending ? "Creating…" : "Create tenant"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <ServerStateStatus
        isFetching={tenantsQuery.isFetching && !tenantsQuery.isPending}
        isStale={tenantsQuery.isStale}
        hasData={hasTenants}
        label="tenants"
        onRefresh={() => void tenantsQuery.refetch()}
      />

      <Card>
        <CardHeader>
          <CardTitle>All tenants</CardTitle>
          <CardDescription>{tenants.length} tenant(s).</CardDescription>
        </CardHeader>
        <CardContent>
          {tenantsQuery.error && !hasTenants ? (
            <ErrorState
              message={tenantsQuery.error.message}
              retry={() => void tenantsQuery.refetch()}
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenantsQuery.isPending && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        Loading tenants…
                      </TableCell>
                    </TableRow>
                  )}
                  {!tenantsQuery.isPending && tenants.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        No tenants yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {!tenantsQuery.isPending &&
                    tenants.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium text-foreground">
                          {t.displayName || t.name}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {t.slug}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[t.status] ?? "secondary"}>
                            {t.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={t.plan}
                            onValueChange={(v) => changePlan(t, v as TenantPlan)}
                            disabled={changePlanMutation.isPending}
                          >
                            <SelectTrigger className="h-8 w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PLANS.map((p) => (
                                <SelectItem key={p} value={p}>
                                  {p}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleSuspend(t)}
                              disabled={updateStatusMutation.isPending}
                            >
                              {t.status === "suspended" ? "Activate" : "Suspend"}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => remove(t)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

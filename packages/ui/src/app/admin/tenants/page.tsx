"use client";

import { Building2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";

type Plan = "free" | "starter" | "pro" | "enterprise";
type Status = "active" | "trial" | "suspended" | "deleted";

interface Tenant {
  id: string;
  slug: string;
  name: string;
  displayName?: string;
  status: Status;
  plan: Plan;
  createdAt?: string;
}

const PLANS: Plan[] = ["free", "starter", "pro", "enterprise"];
const STATUS_VARIANT: Record<string, "success" | "warning" | "secondary" | "destructive"> = {
  active: "success",
  trial: "warning",
  suspended: "secondary",
  deleted: "destructive",
};

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState<{ slug: string; name: string; plan: Plan }>({
    slug: "",
    name: "",
    plan: "free",
  });
  const [creating, setCreating] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ tenants: Tenant[] }>("/admin/tenants?limit=100");
      setTenants(data.tenants ?? []);
    } catch {
      showToast("Failed to load tenants");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post("/admin/tenants", {
        slug: form.slug.trim(),
        name: form.name.trim(),
        plan: form.plan,
      });
      setForm({ slug: "", name: "", plan: "free" });
      showToast("Tenant created");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create tenant");
    } finally {
      setCreating(false);
    }
  }

  async function changePlan(t: Tenant, plan: Plan) {
    try {
      await api.post(`/admin/tenants/${t.id}/plan`, { plan });
      setTenants((prev) => prev.map((x) => (x.id === t.id ? { ...x, plan } : x)));
      showToast(`${t.slug} → ${plan}`);
    } catch {
      showToast("Failed to change plan");
    }
  }

  async function toggleSuspend(t: Tenant) {
    const status: Status = t.status === "suspended" ? "active" : "suspended";
    try {
      await api.put(`/admin/tenants/${t.id}`, { status });
      setTenants((prev) => prev.map((x) => (x.id === t.id ? { ...x, status } : x)));
      showToast(`${t.slug} ${status}`);
    } catch {
      showToast("Failed to update status");
    }
  }

  async function remove(t: Tenant) {
    try {
      await api.delete(`/admin/tenants/${t.id}`);
      setTenants((prev) => prev.filter((x) => x.id !== t.id));
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
                onValueChange={(v) => setForm((f) => ({ ...f, plan: v as Plan }))}
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
              <Button type="submit" disabled={creating} className="w-full">
                {creating ? "Creating…" : "Create tenant"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All tenants</CardTitle>
          <CardDescription>{tenants.length} tenant(s).</CardDescription>
        </CardHeader>
        <CardContent>
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
                {loading && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      Loading…
                    </TableCell>
                  </TableRow>
                )}
                {!loading && tenants.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      No tenants yet.
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  tenants.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium text-foreground">
                        {t.displayName || t.name}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {t.slug}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[t.status] ?? "secondary"}>{t.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <Select value={t.plan} onValueChange={(v) => changePlan(t, v as Plan)}>
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
                          >
                            {t.status === "suspended" ? "Activate" : "Suspend"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => remove(t)}
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
        </CardContent>
      </Card>
    </div>
  );
}

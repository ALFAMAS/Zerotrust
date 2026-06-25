"use client";

import { Globe2 } from "lucide-react";
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
import { api } from "@/lib/api";

interface RegionHealth {
  status: string;
  regions: string[];
}

const REGION_LABEL: Record<string, string> = {
  us: "United States",
  eu: "European Union",
  apac: "Asia-Pacific",
};

export default function RegionsPage() {
  const [health, setHealth] = useState<RegionHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const [orgId, setOrgId] = useState("");
  const [region, setRegion] = useState("us");
  const [saving, setSaving] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setHealth(await api.get<RegionHealth>("/regions/health"));
    } catch {
      showToast("Failed to load region health");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setOrgRegion(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put(`/regions/orgs/${orgId.trim()}/region`, { region });
      showToast(`Org ${orgId} pinned to ${region.toUpperCase()}`);
      setOrgId("");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to set region");
    } finally {
      setSaving(false);
    }
  }

  const regions = health?.regions ?? ["us", "eu", "apac"];

  return (
    <div className="space-y-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground shadow-lg">
          {toast}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Globe2 className="h-6 w-6 text-primary" />
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Data Residency
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Region health and per-organization data-locality controls.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Region health</CardTitle>
          <CardDescription>Active storage regions and overall status.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant={health?.status === "ok" ? "success" : "destructive"}>
                {health?.status ?? "unknown"}
              </Badge>
              {regions.map((r) => (
                <Badge key={r} variant="outline">
                  {r.toUpperCase()} · {REGION_LABEL[r] ?? r}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pin an organization to a region</CardTitle>
          <CardDescription>
            Set where an organization&apos;s data is stored. Strict residency rejects cross-region
            access.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={setOrgRegion} className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="orgId">Organization ID</Label>
              <Input
                id="orgId"
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
                placeholder="org uuid"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="region">Region</Label>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger id="region">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {regions.map((r) => (
                    <SelectItem key={r} value={r}>
                      {REGION_LABEL[r] ?? r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={saving} className="w-full">
                {saving ? "Saving…" : "Set region"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

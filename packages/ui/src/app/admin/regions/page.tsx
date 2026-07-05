"use client";

import { Globe2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSetOrgDomainMutation, useUpdateOrgBrandingMutation } from "@/lib/server-state/regions";

export default function RegionsPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [brandingOrgId, setBrandingOrgId] = useState("");
  const [branding, setBranding] = useState({ appName: "", brandColor: "#6366f1", logoUrl: "" });
  const [domainOrgId, setDomainOrgId] = useState("");
  const [customDomain, setCustomDomain] = useState("");

  const updateBrandingMutation = useUpdateOrgBrandingMutation();
  const setDomainMutation = useSetOrgDomainMutation();

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  async function saveBranding(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = brandingOrgId.trim();
    try {
      await updateBrandingMutation.mutateAsync({
        orgId: trimmed,
        branding: {
          appName: branding.appName || undefined,
          brandColor: branding.brandColor || undefined,
          logoUrl: branding.logoUrl || undefined,
        },
      });
      showToast(`Branding updated for ${trimmed}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update branding");
    }
  }

  async function saveDomain(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = domainOrgId.trim();
    try {
      await setDomainMutation.mutateAsync({
        orgId: trimmed,
        domain: customDomain.trim() || null,
      });
      showToast(`Domain updated for ${trimmed}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to set domain");
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
        <Globe2 className="h-6 w-6 text-primary" />
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Branding &amp; Domains
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Per-organization white-label branding and custom hostname mapping.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Org branding</CardTitle>
          <CardDescription>
            White-label app name, colors, and logo for an organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveBranding} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="brandingOrgId">Organization ID</Label>
              <Input
                id="brandingOrgId"
                value={brandingOrgId}
                onChange={(e) => setBrandingOrgId(e.target.value)}
                placeholder="org uuid"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="appName">App name</Label>
              <Input
                id="appName"
                value={branding.appName}
                onChange={(e) => setBranding((b) => ({ ...b, appName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brandColor">Brand color</Label>
              <Input
                id="brandColor"
                value={branding.brandColor}
                onChange={(e) => setBranding((b) => ({ ...b, brandColor: e.target.value }))}
                placeholder="#6366f1"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="logoUrl">Logo URL</Label>
              <Input
                id="logoUrl"
                value={branding.logoUrl}
                onChange={(e) => setBranding((b) => ({ ...b, logoUrl: e.target.value }))}
                placeholder="https://…"
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={updateBrandingMutation.isPending}>
                {updateBrandingMutation.isPending ? "Saving…" : "Save branding"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom domain</CardTitle>
          <CardDescription>Map a custom hostname to an organization.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveDomain} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="domainOrgId">Organization ID</Label>
              <Input
                id="domainOrgId"
                value={domainOrgId}
                onChange={(e) => setDomainOrgId(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customDomain">Domain (empty to clear)</Label>
              <Input
                id="customDomain"
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                placeholder="app.example.com"
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={setDomainMutation.isPending}>
                {setDomainMutation.isPending ? "Saving…" : "Set domain"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

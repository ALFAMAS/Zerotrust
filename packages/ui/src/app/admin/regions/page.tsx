"use client";

import { Globe2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { FormSection } from "@/components/ui/page-patterns";
import { useToast } from "@/context/ToastContext";
import { useSetOrgDomainMutation, useUpdateOrgBrandingMutation } from "@/lib/server-state/regions";

export default function RegionsPage() {
  const { toast } = useToast();
  const [brandingOrgId, setBrandingOrgId] = useState("");
  const [branding, setBranding] = useState({ appName: "", brandColor: "#6366f1", logoUrl: "" });
  const [domainOrgId, setDomainOrgId] = useState("");
  const [customDomain, setCustomDomain] = useState("");

  const updateBrandingMutation = useUpdateOrgBrandingMutation();
  const setDomainMutation = useSetOrgDomainMutation();

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
      toast({ message: `Branding updated for ${trimmed}`, type: "success" });
    } catch (err) {
      toast({
        message: err instanceof Error ? err.message : "Failed to update branding",
        type: "error",
      });
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
      toast({ message: `Domain updated for ${trimmed}`, type: "success" });
    } catch (err) {
      toast({
        message: err instanceof Error ? err.message : "Failed to set domain",
        type: "error",
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Globe2 className="h-6 w-6 text-primary" />
        <div>
          <PageHeader
            title={<>Branding &amp; Domains</>}
            description={<>Per-organization white-label branding and custom hostname mapping.</>}
          />
        </div>
      </div>

      <FormSection
        title="Org branding"
        description="White-label app name, colors, and logo for an organization."
      >
        <form onSubmit={saveBranding} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="brandingOrgId">Organization ID</Label>
            <Input
              id="brandingOrgId"
              value={brandingOrgId}
              onChange={(e) => setBrandingOrgId(e.target.value)}
              placeholder="org uuid"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="appName">App name</Label>
            <Input
              id="appName"
              value={branding.appName}
              onChange={(e) => setBranding((b) => ({ ...b, appName: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brandColor">Brand color</Label>
            <Input
              id="brandColor"
              value={branding.brandColor}
              onChange={(e) => setBranding((b) => ({ ...b, brandColor: e.target.value }))}
              placeholder="#6366f1"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
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
      </FormSection>

      <FormSection title="Custom domain" description="Map a custom hostname to an organization.">
        <form onSubmit={saveDomain} className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="domainOrgId">Organization ID</Label>
            <Input
              id="domainOrgId"
              value={domainOrgId}
              onChange={(e) => setDomainOrgId(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
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
      </FormSection>
    </div>
  );
}

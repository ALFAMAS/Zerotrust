"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState, LoadingSpinner } from "@/components/ui/States";
import { useToast } from "@/context/ToastContext";
import {
  GENERAL_SETTINGS_DEFAULTS,
  useAdminSettingsQuery,
  useSaveAdminSettingsMutation,
} from "@/lib/server-state/settings";
import type { GeneralSettings } from "@/lib/server-state/types";

export default function GeneralSettingsPage() {
  const settingsQuery = useAdminSettingsQuery();
  const saveMutation = useSaveAdminSettingsMutation();
  const [form, setForm] = useState<GeneralSettings>(GENERAL_SETTINGS_DEFAULTS);
  const { toast } = useToast();
  const hasSettings = settingsQuery.data !== undefined;

  useEffect(() => {
    if (settingsQuery.data) {
      setForm(settingsQuery.data);
    }
  }, [settingsQuery.data]);

  function set<K extends keyof GeneralSettings>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      await saveMutation.mutateAsync(form);
      toast({ message: "Settings saved successfully", type: "success" });
    } catch {
      toast({ message: "Failed to save settings", type: "error" });
    }
  }

  if (settingsQuery.isPending) {
    return <LoadingSpinner />;
  }

  if (settingsQuery.error && !hasSettings) {
    return (
      <ErrorState
        message={settingsQuery.error.message}
        retry={() => void settingsQuery.refetch()}
      />
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <PageHeader
          title={<>General Settings</>}
          description={<>Branding and contact information</>}
        />
      </div>

      <ServerStateStatus
        isFetching={settingsQuery.isFetching && !settingsQuery.isPending}
        isStale={settingsQuery.isStale}
        hasData={hasSettings}
        label="settings"
        onRefresh={() => void settingsQuery.refetch()}
      />

      <Card>
        <form onSubmit={handleSave}>
          <CardContent className="space-y-6 pt-6">
            <div className="space-y-2">
              <Label htmlFor="general-app-name">App Name</Label>
              <Input
                id="general-app-name"
                type="text"
                value={form.appName}
                onChange={(e) => set("appName", e.target.value)}
                placeholder="Acme Corp"
              />
              <p className="text-xs text-muted-foreground">Shown on the sign-in page and emails</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="general-app-url">App URL</Label>
              <Input
                id="general-app-url"
                type="url"
                value={form.appUrl}
                onChange={(e) => set("appUrl", e.target.value)}
                placeholder="https://app.acme.com"
              />
              <p className="text-xs text-muted-foreground">
                Used for redirect URLs and email links
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="general-support-email">Support Email</Label>
              <Input
                id="general-support-email"
                type="email"
                value={form.supportEmail}
                onChange={(e) => set("supportEmail", e.target.value)}
                placeholder="support@acme.com"
              />
              <p className="text-xs text-muted-foreground">
                Contact email shown in system-generated emails
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="general-logo-url">Logo URL</Label>
              <Input
                id="general-logo-url"
                type="text"
                value={form.logoUrl}
                onChange={(e) => set("logoUrl", e.target.value)}
                placeholder="https://acme.com/logo.png"
              />
              <p className="text-xs text-muted-foreground">
                Link to your logo image (PNG or SVG recommended)
              </p>

              {form.logoUrl && (
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex items-center justify-center rounded-lg border border-border bg-muted p-3">
                    <Image
                      src={form.logoUrl}
                      alt="Logo preview"
                      width={128}
                      height={48}
                      unoptimized
                      className="max-h-12 max-w-32 object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Preview</p>
                </div>
              )}
            </div>
          </CardContent>

          <CardFooter className="justify-end">
            <Button type="submit" disabled={saveMutation.isPending} className="min-w-[140px]">
              {saveMutation.isPending ? "Saving…" : "Save Settings"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

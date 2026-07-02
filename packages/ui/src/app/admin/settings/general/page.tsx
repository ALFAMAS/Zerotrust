"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/States";
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
  const [toast, setToast] = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hasSettings = settingsQuery.data !== undefined;

  useEffect(() => {
    if (settingsQuery.data) {
      setForm(settingsQuery.data);
    }
  }, [settingsQuery.data]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  function set<K extends keyof GeneralSettings>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      await saveMutation.mutateAsync(form);
      showToast("Settings saved successfully");
    } catch {
      showToast("Failed to save settings");
    }
  }

  if (settingsQuery.isPending) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
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
    <div className="space-y-6 max-w-2xl">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-primary px-4 py-3 text-sm text-foreground shadow-lg">
          {toast}
        </div>
      )}

      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          General Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Branding and contact information</p>
      </div>

      <ServerStateStatus
        isFetching={settingsQuery.isFetching && !settingsQuery.isPending}
        isStale={settingsQuery.isStale}
        hasData={hasSettings}
        label="settings"
        onRefresh={() => void settingsQuery.refetch()}
      />

      <form onSubmit={handleSave} className="rounded-xl bg-card border border-border p-6 space-y-5">
        {/* App Name */}
        <div>
          <label htmlFor="page-f0" className="block text-sm font-medium text-foreground mb-1">
            App Name
          </label>
          <Input
            id="page-f0"
            type="text"
            value={form.appName}
            onChange={(e) => set("appName", e.target.value)}
            placeholder="Acme Corp"
            className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
          />
          <p className="mt-1 text-xs text-muted-foreground">Shown on the sign-in page and emails</p>
        </div>

        {/* App URL */}
        <div>
          <label htmlFor="page-f1" className="block text-sm font-medium text-foreground mb-1">
            App URL
          </label>
          <Input
            id="page-f1"
            type="url"
            value={form.appUrl}
            onChange={(e) => set("appUrl", e.target.value)}
            placeholder="https://app.acme.com"
            className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Used for redirect URLs and email links
          </p>
        </div>

        {/* Support Email */}
        <div>
          <label htmlFor="page-f2" className="block text-sm font-medium text-foreground mb-1">
            Support Email
          </label>
          <Input
            id="page-f2"
            type="email"
            value={form.supportEmail}
            onChange={(e) => set("supportEmail", e.target.value)}
            placeholder="support@acme.com"
            className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Contact email shown in system-generated emails
          </p>
        </div>

        {/* Logo URL */}
        <div>
          <label htmlFor="page-f3" className="block text-sm font-medium text-foreground mb-1">
            Logo URL
          </label>
          <Input
            id="page-f3"
            type="text"
            value={form.logoUrl}
            onChange={(e) => set("logoUrl", e.target.value)}
            placeholder="https://acme.com/logo.png"
            className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Link to your logo image (PNG or SVG recommended)
          </p>

          {/* Logo preview */}
          {form.logoUrl && (
            <div className="mt-3 flex items-center gap-3">
              <div className="rounded-lg bg-muted border border-border p-3 flex items-center justify-center">
                {/* biome-ignore lint/performance/noImgElement: operator-supplied logo URL from any host; next/image needs known domains/dimensions */}
                <img
                  src={form.logoUrl}
                  alt="Logo preview"
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

        {/* Save */}
        <div className="pt-2 flex justify-end">
          <Button
            type="submit"
            disabled={saveMutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors min-w-[140px] justify-center"
          >
            {saveMutation.isPending ? (
              <>
                <svg
                  aria-hidden="true"
                  className="h-4 w-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Saving…
              </>
            ) : (
              "Save Settings"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}

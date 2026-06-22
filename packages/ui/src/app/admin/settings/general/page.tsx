"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

interface GeneralSettings {
  appName: string;
  appUrl: string;
  supportEmail: string;
  logoUrl: string;
}

const DEFAULTS: GeneralSettings = {
  appName: "",
  appUrl: "",
  supportEmail: "",
  logoUrl: "",
};

export default function GeneralSettingsPage() {
  const [settings, setSettings] = useState<GeneralSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<Partial<GeneralSettings>>("/admin/settings");
        setSettings({ ...DEFAULTS, ...data });
      } catch {
        // use defaults
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function set<K extends keyof GeneralSettings>(key: K, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.put("/admin/settings", settings);
      showToast("Settings saved successfully");
    } catch {
      showToast("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading…</div>
      </div>
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

      <form onSubmit={handleSave} className="rounded-xl bg-card border border-border p-6 space-y-5">
        {/* App Name */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">App Name</label>
          <input
            type="text"
            value={settings.appName}
            onChange={(e) => set("appName", e.target.value)}
            placeholder="Acme Corp"
            className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
          />
          <p className="mt-1 text-xs text-muted-foreground">Shown on the sign-in page and emails</p>
        </div>

        {/* App URL */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">App URL</label>
          <input
            type="url"
            value={settings.appUrl}
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
          <label className="block text-sm font-medium text-foreground mb-1">Support Email</label>
          <input
            type="email"
            value={settings.supportEmail}
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
          <label className="block text-sm font-medium text-foreground mb-1">Logo URL</label>
          <input
            type="text"
            value={settings.logoUrl}
            onChange={(e) => set("logoUrl", e.target.value)}
            placeholder="https://acme.com/logo.png"
            className="w-full rounded-lg bg-muted border border-border px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Link to your logo image (PNG or SVG recommended)
          </p>

          {/* Logo preview */}
          {settings.logoUrl && (
            <div className="mt-3 flex items-center gap-3">
              <div className="rounded-lg bg-muted border border-border p-3 flex items-center justify-center">
                <img
                  src={settings.logoUrl}
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
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors min-w-[140px] justify-center"
          >
            {saving ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
          </button>
        </div>
      </form>
    </div>
  );
}

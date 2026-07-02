"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import Toggle from "@/components/Toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorState } from "@/components/ui/States";
import {
  AUTH_SETTINGS_DEFAULTS,
  useAdminAuthSettingsQuery,
  useSaveAdminAuthSettingsMutation,
} from "@/lib/server-state/settings";
import type { AuthSettings } from "@/lib/server-state/types";

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1 pr-6">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}

function NumberInput({ label, value, onChange, min, max }: NumberInputProps) {
  return (
    <div className="flex items-center justify-between py-3">
      <label htmlFor="page-f0" className="text-sm font-medium text-foreground">
        {label}
      </label>
      <Input
        id="page-f0"
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        className="w-28 text-right"
      />
    </div>
  );
}

export default function AuthSettingsPage() {
  const settingsQuery = useAdminAuthSettingsQuery();
  const saveMutation = useSaveAdminAuthSettingsMutation();
  const [settings, setSettings] = useState<AuthSettings>(AUTH_SETTINGS_DEFAULTS);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (settingsQuery.data) {
      setSettings(settingsQuery.data);
    }
  }, [settingsQuery.data]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  function set<K extends keyof AuthSettings>(key: K, value: AuthSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    try {
      await saveMutation.mutateAsync(settings);
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

  if (settingsQuery.error && !settingsQuery.data) {
    return (
      <ErrorState
        message={settingsQuery.error.message || "Failed to load auth settings"}
        retry={() => void settingsQuery.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-lg bg-primary px-4 py-3 text-sm text-foreground shadow-lg">
          {toast}
        </div>
      )}

      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Auth Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure authentication methods, MFA, and security policy
        </p>
      </div>

      <ServerStateStatus
        isFetching={settingsQuery.isFetching}
        isStale={settingsQuery.isStale}
        hasData={Boolean(settingsQuery.data)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="rounded-xl bg-card border border-border p-5">
            <h2 className="font-semibold text-foreground mb-1">Authentication Methods</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Choose how users can sign in to your app
            </p>
            <div className="divide-y divide-border">
              <ToggleRow
                label="Email & Password"
                description="Users can register and sign in with email/password"
                checked={settings.emailPasswordEnabled}
                onChange={(v) => set("emailPasswordEnabled", v)}
              />
              <ToggleRow
                label="Google OAuth"
                description='"Continue with Google" button on sign-in page'
                checked={settings.googleOAuthEnabled}
                onChange={(v) => set("googleOAuthEnabled", v)}
              />
              <ToggleRow
                label="GitHub OAuth"
                description='"Continue with GitHub" button on sign-in page'
                checked={settings.githubOAuthEnabled}
                onChange={(v) => set("githubOAuthEnabled", v)}
              />
              <ToggleRow
                label="Magic Links"
                description="Passwordless email sign-in links (15-min TTL)"
                checked={settings.magicLinkEnabled}
                onChange={(v) => set("magicLinkEnabled", v)}
              />
              <ToggleRow
                label="Passkeys / WebAuthn"
                description="Biometric and hardware key authentication"
                checked={settings.passkeyEnabled}
                onChange={(v) => set("passkeyEnabled", v)}
              />
            </div>
          </div>

          <div className="rounded-xl bg-card border border-border p-5">
            <h2 className="font-semibold text-foreground mb-1">Registration</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Control who can create new accounts
            </p>
            <div className="divide-y divide-border">
              <ToggleRow
                label="Allow new registrations"
                description="If off, only existing users can sign in"
                checked={settings.registrationEnabled}
                onChange={(v) => set("registrationEnabled", v)}
              />
              <ToggleRow
                label="Require email verification"
                description="New accounts must verify email before signing in"
                checked={settings.requireEmailVerification}
                onChange={(v) => set("requireEmailVerification", v)}
              />
            </div>
            <div className="mt-4">
              <label htmlFor="page-f1" className="block text-sm font-medium text-foreground mb-1">
                Allowed Email Domains
              </label>
              <Input
                id="page-f1"
                type="text"
                placeholder="acme.com, corp.com (leave blank for all)"
                value={settings.allowedEmailDomains}
                onChange={(e) => set("allowedEmailDomains", e.target.value)}
                className="w-full"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Comma-separated. Leave blank to allow all domains.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl bg-card border border-border p-5">
            <h2 className="font-semibold text-foreground mb-1">Multi-Factor Authentication</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Second-factor options available to users
            </p>
            <div className="divide-y divide-border">
              <ToggleRow
                label="Authenticator App (TOTP)"
                description="Google Authenticator, 1Password, etc."
                checked={settings.totpEnabled}
                onChange={(v) => set("totpEnabled", v)}
              />
              <ToggleRow
                label="Email OTP"
                description="One-time codes via email"
                checked={settings.emailOtpEnabled}
                onChange={(v) => set("emailOtpEnabled", v)}
              />
              <ToggleRow
                label="SMS OTP"
                description="One-time codes via SMS (requires Twilio)"
                checked={settings.smsOtpEnabled}
                onChange={(v) => set("smsOtpEnabled", v)}
              />
              <ToggleRow
                label="Require MFA for all users"
                description="Force MFA enrollment on first login"
                checked={settings.requireMfaForAll}
                onChange={(v) => set("requireMfaForAll", v)}
              />
            </div>
          </div>

          <div className="rounded-xl bg-card border border-border p-5">
            <h2 className="font-semibold text-foreground mb-1">Security Settings</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Session and account lockout configuration
            </p>
            <div className="divide-y divide-border">
              <NumberInput
                label="Session Duration (seconds)"
                value={settings.sessionTTLSeconds}
                onChange={(v) => set("sessionTTLSeconds", v)}
                min={300}
                max={86400}
              />
              <NumberInput
                label="Max Concurrent Sessions"
                value={settings.maxConcurrentSessions}
                onChange={(v) => set("maxConcurrentSessions", v)}
                min={1}
                max={20}
              />
              <ToggleRow
                label="Account Lockout"
                description="Lock accounts after repeated failed login attempts"
                checked={settings.accountLockoutEnabled}
                onChange={(v) => set("accountLockoutEnabled", v)}
              />
              <NumberInput
                label="Lockout After N Failed Attempts"
                value={settings.accountLockoutThreshold}
                onChange={(v) => set("accountLockoutThreshold", v)}
                min={3}
                max={20}
              />
              <NumberInput
                label="Lockout Duration (minutes)"
                value={settings.accountLockoutDurationMinutes}
                onChange={(v) => set("accountLockoutDurationMinutes", v)}
                min={5}
                max={1440}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="gap-2 px-6 py-2.5 text-sm font-medium min-w-[140px]"
        >
          {saveMutation.isPending ? "Saving…" : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}

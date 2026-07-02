"use client";

import { Bell, BellOff, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import Toggle from "@/components/Toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/context/ToastContext";
import { api } from "@/lib/api";
import { isPushSupported, isSubscribed, subscribeToPush, unsubscribeFromPush } from "@/lib/push";

interface NotificationPreferences {
  emailFallback: boolean;
  emailFallbackDays: number;
  categories?: Record<string, { email?: boolean; push?: boolean; inApp?: boolean }>;
}

const NOTIF_CATEGORIES: { key: string; label: string; desc: string }[] = [
  { key: "security", label: "Security", desc: "Logins, MFA, passkeys, suspicious activity" },
  { key: "billing", label: "Billing", desc: "Invoices, payment failures, plan changes" },
  {
    key: "account",
    label: "Account",
    desc: "Profile changes, password resets, email verification",
  },
  { key: "social", label: "Social", desc: "Mentions, invites, team activity" },
  { key: "system", label: "System", desc: "Maintenance, outages, product updates" },
];

export default function NotificationSettingsPage() {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    emailFallback: true,
    emailFallbackDays: 3,
  });
  const [loading, setLoading] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const [pushSupported, setPushSupported] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    api
      .get<NotificationPreferences>("/notifications/preferences")
      .then(setPrefs)
      .catch(() => {})
      .finally(() => setLoading(false));

    const supported = isPushSupported();
    setPushSupported(supported);
    if (supported) {
      isSubscribed()
        .then(setPushOn)
        .catch(() => {});
    }
  }, []);

  async function savePrefs(next: Partial<NotificationPreferences>) {
    const merged = { ...prefs, ...next };
    setPrefs(merged);
    setSavingPrefs(true);
    try {
      await api.put("/notifications/preferences", next);
    } catch {
      toast({
        type: "error",
        message: "Couldn't save notification preferences.",
      });
    } finally {
      setSavingPrefs(false);
    }
  }

  async function togglePush(enable: boolean) {
    setPushBusy(true);
    try {
      if (enable) {
        const ok = await subscribeToPush();
        if (!ok) {
          toast({
            type: "error",
            message:
              "Push couldn't be enabled. Check that notifications are allowed for this site.",
          });
          setPushOn(false);
          return;
        }
        setPushOn(true);
        toast({
          type: "success",
          message: "Push notifications enabled on this device.",
        });
      } else {
        await unsubscribeFromPush();
        setPushOn(false);
        toast({
          type: "info",
          message: "Push notifications disabled on this device.",
        });
      }
    } catch {
      toast({
        type: "error",
        message: "Something went wrong updating push notifications.",
      });
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Notifications
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose how zerotrust reaches you about security events and account activity.
        </p>
      </div>

      {/* Push notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {pushOn ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            Push notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pushSupported ? (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Smartphone className="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground" />
                <div>
                  <Label className="text-sm font-medium text-foreground">
                    Enable on this device
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Get real-time alerts even when zerotrust isn't open. Manage this per device.
                  </p>
                </div>
              </div>
              <Toggle checked={pushOn} onChange={togglePush} disabled={pushBusy} />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This browser doesn't support web push notifications. Install zerotrust as an app or
              use a supported browser to enable them.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Email fallback */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email fallback</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm font-medium text-foreground">Email me when I'm away</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                If you haven't seen an important notification in-app, send it to your email too.
              </p>
            </div>
            <Toggle
              checked={prefs.emailFallback}
              onChange={(v) => savePrefs({ emailFallback: v })}
              disabled={loading || savingPrefs}
            />
          </div>
        </CardContent>
      </Card>

      {/* Per-category preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-category preferences</CardTitle>
          <p className="text-sm text-muted-foreground">
            Choose which notification channels are active for each category.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {NOTIF_CATEGORIES.map((cat) => {
            const c = prefs.categories?.[cat.key] ?? {};
            const updateCat = (channel: "email" | "push" | "inApp", val: boolean) => {
              const next = {
                ...prefs.categories,
                [cat.key]: { ...c, [channel]: val },
              };
              void savePrefs({ categories: next });
            };
            return (
              <div
                key={cat.key}
                className="flex flex-col gap-2 rounded-lg bg-muted p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <Label className="text-sm font-medium text-foreground">{cat.label}</Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">{cat.desc}</p>
                </div>
                <div className="flex items-center gap-3">
                  {(["email", "push", "inApp"] as const).map((ch) => (
                    <div key={ch} className="flex items-center gap-1.5">
                      <Label className="text-xs capitalize text-muted-foreground">{ch}</Label>
                      <Toggle
                        checked={c[ch] !== false}
                        onChange={(v) => updateCat(ch, v)}
                        disabled={loading || savingPrefs}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

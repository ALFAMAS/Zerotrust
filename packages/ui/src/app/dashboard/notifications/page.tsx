"use client";

import { Bell, BellOff, Loader2, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import Toggle from "@/components/Toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/components/ui/States";
import { useToast } from "@/context/ToastContext";
import { isPushSupported, isSubscribed, subscribeToPush, unsubscribeFromPush } from "@/lib/push";
import {
  useNotificationPreferencesQuery,
  useUpdateNotificationPreferencesMutation,
} from "@/lib/server-state/notifications";
import type { NotificationPreferences } from "@/lib/server-state/types";

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

const DEFAULT_PREFS: NotificationPreferences = {
  emailFallback: true,
  emailFallbackDays: 3,
};

export default function NotificationSettingsPage() {
  const { toast } = useToast();
  const prefsQuery = useNotificationPreferencesQuery();
  const updatePrefsMutation = useUpdateNotificationPreferencesMutation();

  const prefs = prefsQuery.data ?? DEFAULT_PREFS;
  const hasPrefs = Boolean(prefsQuery.data);

  const [pushSupported, setPushSupported] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    const supported = isPushSupported();
    setPushSupported(supported);
    if (supported) {
      isSubscribed()
        .then(setPushOn)
        .catch(() => {});
    }
  }, []);

  async function savePrefs(next: Partial<NotificationPreferences>) {
    try {
      await updatePrefsMutation.mutateAsync(next);
    } catch {
      toast({
        type: "error",
        message: "Couldn't save notification preferences.",
      });
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

  const savingPrefs = updatePrefsMutation.isPending;
  const loading = prefsQuery.isPending;

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

      <ServerStateStatus
        isFetching={prefsQuery.isFetching && !prefsQuery.isPending}
        isStale={prefsQuery.isStale}
        hasData={hasPrefs}
        label="notification preferences"
        onRefresh={() => void prefsQuery.refetch()}
      />

      {prefsQuery.error && !hasPrefs ? (
        <ErrorState message={prefsQuery.error.message} retry={() => void prefsQuery.refetch()} />
      ) : loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading preferences…
        </div>
      ) : (
        <>
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
                  This browser doesn't support web push notifications. Install zerotrust as an app
                  or use a supported browser to enable them.
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
                  <Label className="text-sm font-medium text-foreground">
                    Email me when I'm away
                  </Label>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    If you haven't seen an important notification in-app, send it to your email too.
                  </p>
                </div>
                <Toggle
                  checked={prefs.emailFallback}
                  onChange={(v) => void savePrefs({ emailFallback: v })}
                  disabled={savingPrefs}
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
                            disabled={savingPrefs}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

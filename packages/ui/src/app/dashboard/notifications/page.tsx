"use client";

import { Bell, BellOff, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import Toggle from "@/components/Toggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/context/ToastContext";
import { api } from "@/lib/api";
import {
  isPushSupported,
  isSubscribed,
  subscribeToPush,
  unsubscribeFromPush,
} from "@/lib/push";

interface NotificationPreferences {
  emailFallback: boolean;
  emailFallbackDays: number;
}

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
          Choose how zerotrust reaches you about security events and account
          activity.
        </p>
      </div>

      {/* Push notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {pushOn ? (
              <Bell className="h-4 w-4" />
            ) : (
              <BellOff className="h-4 w-4" />
            )}
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
                    Get real-time alerts even when zerotrust isn't open. Manage
                    this per device.
                  </p>
                </div>
              </div>
              <Toggle
                checked={pushOn}
                onChange={togglePush}
                disabled={pushBusy}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              This browser doesn't support web push notifications. Install
              zerotrust as an app or use a supported browser to enable them.
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
                If you haven't seen an important notification in-app, send it to
                your email too.
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
    </div>
  );
}

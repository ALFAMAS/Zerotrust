"use client";

import { Bell, Plus, Send, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SkeletonCard } from "@/components/Skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/context/ToastContext";
import { api } from "@/lib/api";

type ChannelType = "slack" | "teams" | "pagerduty";

interface NotificationChannel {
  id: string;
  type: ChannelType;
  name: string;
  enabled: boolean;
  events: string[];
  config: { webhookUrl?: string; integrationKey?: string };
}

// The most useful security/ops alerts to start with (the backend supports more).
const DEFAULT_EVENTS = [
  "anomaly.detected",
  "auth.brute_force",
  "user.locked",
  "session.mass_revocation",
  "error.spike",
  "slo.burn",
];

const TYPE_LABELS: Record<ChannelType, string> = {
  slack: "Slack",
  teams: "Microsoft Teams",
  pagerduty: "PagerDuty",
};

export default function AdminAlertsPage() {
  const { toast } = useToast();
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Add-channel form
  const [type, setType] = useState<ChannelType>("slack");
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ channels: NotificationChannel[] }>(
        "/admin/notifications/channels"
      );
      setChannels(res.channels ?? []);
    } catch {
      toast({ message: "Could not load alert channels", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const secretLabel = type === "pagerduty" ? "Integration key" : "Webhook URL";

  async function addChannel(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !secret.trim()) return;
    setBusy(true);
    try {
      const config =
        type === "pagerduty" ? { integrationKey: secret.trim() } : { webhookUrl: secret.trim() };
      await api.post("/admin/notifications/channels", {
        type,
        name: name.trim(),
        enabled: true,
        events: DEFAULT_EVENTS,
        config,
      });
      setName("");
      setSecret("");
      toast({ message: `${TYPE_LABELS[type]} channel added`, type: "success" });
      await load();
    } catch (err) {
      toast({ message: (err as Error).message || "Could not add channel", type: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(ch: NotificationChannel) {
    try {
      await api.patch(`/admin/notifications/channels/${ch.id}`, { enabled: !ch.enabled });
      setChannels((cs) => cs.map((c) => (c.id === ch.id ? { ...c, enabled: !c.enabled } : c)));
    } catch (err) {
      toast({ message: (err as Error).message || "Update failed", type: "error" });
    }
  }

  async function testChannel(ch: NotificationChannel) {
    try {
      await api.post(`/admin/notifications/channels/${ch.id}/test`, {});
      toast({ message: `Test alert sent to ${ch.name}`, type: "success" });
    } catch (err) {
      toast({ message: (err as Error).message || "Test failed", type: "error" });
    }
  }

  async function removeChannel(ch: NotificationChannel) {
    if (!confirm(`Delete the "${ch.name}" alert channel?`)) return;
    try {
      await api.delete(`/admin/notifications/channels/${ch.id}`);
      setChannels((cs) => cs.filter((c) => c.id !== ch.id));
      toast({ message: "Channel deleted", type: "success" });
    } catch (err) {
      toast({ message: (err as Error).message || "Delete failed", type: "error" });
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 flex items-center gap-2 font-display text-2xl font-semibold tracking-tight text-foreground">
        <Bell className="h-6 w-6 text-primary" aria-hidden="true" /> Alert Channels
      </h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Fan out security and reliability events (anomalies, brute-force, SLO burn) to Slack,
        Microsoft Teams, or PagerDuty.
      </p>

      {/* Add channel */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Add a channel</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={addChannel} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ch-type">Destination</Label>
              <Select value={type} onValueChange={(v) => setType(v as ChannelType)}>
                <SelectTrigger id="ch-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="slack">Slack</SelectItem>
                  <SelectItem value="teams">Microsoft Teams</SelectItem>
                  <SelectItem value="pagerduty">PagerDuty</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ch-name">Name</Label>
              <Input
                id="ch-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Security on-call"
                maxLength={80}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ch-secret">{secretLabel}</Label>
              <Input
                id="ch-secret"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={
                  type === "pagerduty" ? "PagerDuty Events v2 integration key" : "https://…"
                }
                autoComplete="off"
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy || !name.trim() || !secret.trim()}>
                <Plus className="h-4 w-4" /> {busy ? "Adding…" : "Add channel"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Channel list */}
      {loading ? (
        <SkeletonCard className="h-40" />
      ) : channels.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <Bell className="mx-auto mb-3 h-9 w-9 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              No alert channels yet. Add one above to start receiving alerts.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {channels.map((ch) => (
            <li key={ch.id}>
              <Card>
                <CardContent className="flex flex-wrap items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{ch.name}</span>
                      <Badge variant="secondary">{TYPE_LABELS[ch.type]}</Badge>
                      {!ch.enabled && <Badge variant="outline">Disabled</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {ch.events.length} event{ch.events.length === 1 ? "" : "s"} ·{" "}
                      {ch.config.webhookUrl ? "webhook configured" : "integration key set"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        id={`enabled-${ch.id}`}
                        checked={ch.enabled}
                        onCheckedChange={() => toggleEnabled(ch)}
                      />
                      <Label htmlFor={`enabled-${ch.id}`} className="text-xs text-muted-foreground">
                        Enabled
                      </Label>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => testChannel(ch)}
                    >
                      <Send className="h-4 w-4" /> Test
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${ch.name}`}
                      onClick={() => removeChannel(ch)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

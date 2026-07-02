"use client";

import { Bell, Plus, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { SkeletonCard } from "@/components/Skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState } from "@/components/ui/States";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/context/ToastContext";
import {
  useAlertChannelsQuery,
  useCreateAlertChannelMutation,
  useDeleteAlertChannelMutation,
  useTestAlertChannelMutation,
  useToggleAlertChannelMutation,
} from "@/lib/server-state/alertChannels";
import type { AlertChannel, AlertChannelType } from "@/lib/server-state/types";

const DEFAULT_EVENTS = [
  "anomaly.detected",
  "auth.brute_force",
  "user.locked",
  "session.mass_revocation",
  "error.spike",
  "slo.burn",
];

const TYPE_LABELS: Record<AlertChannelType, string> = {
  slack: "Slack",
  teams: "Microsoft Teams",
  pagerduty: "PagerDuty",
};

export default function AdminAlertsPage() {
  const { toast } = useToast();
  const channelsQuery = useAlertChannelsQuery();
  const createMutation = useCreateAlertChannelMutation();
  const toggleMutation = useToggleAlertChannelMutation();
  const testMutation = useTestAlertChannelMutation();
  const deleteMutation = useDeleteAlertChannelMutation();

  const [type, setType] = useState<AlertChannelType>("slack");
  const [name, setName] = useState("");
  const [secret, setSecret] = useState("");

  const channels = channelsQuery.data?.channels ?? [];
  const loading = channelsQuery.isLoading;
  const error = channelsQuery.error;

  const secretLabel = type === "pagerduty" ? "Integration key" : "Webhook URL";

  async function addChannel(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !secret.trim()) return;
    try {
      const config =
        type === "pagerduty" ? { integrationKey: secret.trim() } : { webhookUrl: secret.trim() };
      await createMutation.mutateAsync({
        type,
        name: name.trim(),
        enabled: true,
        events: DEFAULT_EVENTS,
        config,
      });
      setName("");
      setSecret("");
      toast({ message: `${TYPE_LABELS[type]} channel added`, type: "success" });
    } catch (err) {
      toast({ message: (err as Error).message || "Could not add channel", type: "error" });
    }
  }

  async function toggleEnabled(ch: AlertChannel) {
    try {
      await toggleMutation.mutateAsync({ id: ch.id, enabled: !ch.enabled });
    } catch (err) {
      toast({ message: (err as Error).message || "Update failed", type: "error" });
    }
  }

  async function testChannel(ch: AlertChannel) {
    try {
      await testMutation.mutateAsync(ch.id);
      toast({ message: `Test alert sent to ${ch.name}`, type: "success" });
    } catch (err) {
      toast({ message: (err as Error).message || "Test failed", type: "error" });
    }
  }

  async function removeChannel(ch: AlertChannel) {
    if (!confirm(`Delete the "${ch.name}" alert channel?`)) return;
    try {
      await deleteMutation.mutateAsync(ch.id);
      toast({ message: "Channel deleted", type: "success" });
    } catch (err) {
      toast({ message: (err as Error).message || "Delete failed", type: "error" });
    }
  }

  if (error && !channelsQuery.data) {
    return (
      <ErrorState
        message={error.message || "Could not load alert channels"}
        retry={() => void channelsQuery.refetch()}
      />
    );
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

      <ServerStateStatus
        isFetching={channelsQuery.isFetching}
        isStale={channelsQuery.isStale}
        hasData={channels.length > 0}
        label="alert channels"
        onRefresh={() => void channelsQuery.refetch()}
      />

      {/* Add channel */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Add a channel</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void addChannel(e)} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ch-type">Destination</Label>
              <Select value={type} onValueChange={(v) => setType(v as AlertChannelType)}>
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
              <Button
                type="submit"
                disabled={createMutation.isPending || !name.trim() || !secret.trim()}
              >
                <Plus className="h-4 w-4" /> {createMutation.isPending ? "Adding…" : "Add channel"}
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
                        onCheckedChange={() => void toggleEnabled(ch)}
                        disabled={
                          toggleMutation.isPending && toggleMutation.variables?.id === ch.id
                        }
                      />
                      <Label htmlFor={`enabled-${ch.id}`} className="text-xs text-muted-foreground">
                        Enabled
                      </Label>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void testChannel(ch)}
                      disabled={testMutation.isPending && testMutation.variables === ch.id}
                    >
                      <Send className="h-4 w-4" /> Test
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete ${ch.name}`}
                      onClick={() => void removeChannel(ch)}
                      disabled={deleteMutation.isPending && deleteMutation.variables === ch.id}
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

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useOrgFeatureFlagsQuery,
  useUpsertFeatureFlagMutation,
} from "@/lib/server-state/featureFlags";

export function OrgFeatureFlagsPanel({ orgId }: { orgId: string }) {
  const flagsQuery = useOrgFeatureFlagsQuery(orgId);
  const upsertMutation = useUpsertFeatureFlagMutation(orgId);
  const [newKey, setNewKey] = useState("");
  const flags = flagsQuery.data?.flags ?? [];

  async function addFlag() {
    const key = newKey.trim();
    if (!key) return;
    await upsertMutation.mutateAsync({ key, enabled: false, rolloutPercent: 100 });
    setNewKey("");
  }

  return (
    <Card className="p-6">
      <h2 className="mb-1 text-sm font-semibold text-foreground">Feature flags</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Org-scoped toggles for progressive delivery.
      </p>
      <div className="mb-4 flex gap-2">
        <Input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="flag_key"
          className="max-w-xs"
        />
        <Button type="button" size="sm" onClick={addFlag} disabled={upsertMutation.isPending}>
          Add
        </Button>
      </div>
      <ul className="space-y-3">
        {flags.map((flag) => (
          <li key={flag.key} className="flex items-center justify-between gap-4 text-sm">
            <span className="font-mono text-xs">{flag.key}</span>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`ff-${flag.key}`}
                checked={flag.enabled}
                onCheckedChange={(checked) =>
                  upsertMutation.mutate({
                    key: flag.key,
                    enabled: checked === true,
                    rolloutPercent: flag.rolloutPercent,
                  })
                }
              />
              <Label htmlFor={`ff-${flag.key}`} className="text-xs font-normal">
                Enabled
              </Label>
            </div>
          </li>
        ))}
        {flags.length === 0 && (
          <p className="text-xs text-muted-foreground">No flags configured for this org.</p>
        )}
      </ul>
    </Card>
  );
}

"use client";

import { Activity, FileText, UserPlus, AtSign, Settings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { SkeletonCard } from "@/components/Skeleton";

interface ActivityEvent {
  id: string;
  type: string;
  title: string;
  description?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  userId: string;
  userName?: string;
}

const EVENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  note_created: FileText,
  note_updated: FileText,
  member_joined: UserPlus,
  mention: AtSign,
  settings_changed: Settings,
};

function getEventIcon(type: string) {
  return EVENT_ICONS[type] ?? Activity;
}

export default function ActivityFeedPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ orgs: Array<{ org: { id: string }; member: { id: string } }> }>("/orgs")
      .then((d) => {
        if (d.orgs && d.orgs.length > 0) setOrgId(d.orgs[0].org.id);
      })
      .catch(() => {});
  }, []);

  const fetchActivity = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const data = await api.get<{ events: ActivityEvent[] }>(
        `/collab/activity?orgId=${orgId}&limit=30`,
      );
      setEvents(data.events || []);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  // Poll for new activity every 30s (simple approach; SSE later if needed)
  useEffect(() => {
    if (!orgId) return;
    const interval = setInterval(fetchActivity, 30_000);
    return () => clearInterval(interval);
  }, [orgId, fetchActivity]);

  if (!orgId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Activity className="mb-4 h-12 w-12 text-muted-foreground/50" />
        <h2 className="text-lg font-medium text-foreground">No organization selected</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Join an organization to view the activity feed.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Team Activity
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          See what your team has been working on
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          <SkeletonCard className="h-16" />
          <SkeletonCard className="h-16" />
          <SkeletonCard className="h-16" />
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Activity className="mb-3 h-10 w-10 text-muted-foreground/50" />
          <h3 className="text-sm font-medium text-foreground">No activity yet</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Your team&apos;s actions will appear here
          </p>
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 h-full w-px bg-border" />

          <div className="space-y-4">
            {events.map((event) => {
              const Icon = getEventIcon(event.type);
              return (
                <div key={event.id} className="relative flex gap-4 pl-10">
                  {/* Icon dot */}
                  <div className="absolute left-2 top-1 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card">
                    <Icon className="h-2.5 w-2.5 text-muted-foreground" />
                  </div>

                  <div className="flex-1 rounded-xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">{event.title}</p>
                        {event.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {event.description}
                          </p>
                        )}
                      </div>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {event.userName && (
                      <div className="mt-2 text-[11px] text-muted-foreground">
                        by {event.userName}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { Check, Copy, MousePointerClick, Share2, Trophy, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SkeletonCard, SkeletonText } from "@/components/Skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/context/ToastContext";
import { api } from "@/lib/api";

interface ReferralLink {
  code: string;
  slug: string;
  clicks: number;
  signups: number;
  conversions: number;
  rewardsEarned: number;
}

interface ReferralDashboard {
  totalClicks: number;
  totalSignups: number;
  totalConversions: number;
  totalRewards: number;
  links: ReferralLink[];
  displayName: string;
  referralUrlBase: string;
}

export default function ReferralsPage() {
  const { toast } = useToast();
  const [data, setData] = useState<ReferralDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const dash = await api.get<ReferralDashboard>("/wallet/referrals/dashboard");
      setData(dash);
    } catch {
      toast({ message: "Could not load your referral dashboard", type: "error" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post("/wallet/referrals", { slug: slug.trim() || undefined });
      setSlug("");
      toast({ message: "Referral link created", type: "success" });
      await load();
    } catch (err) {
      toast({ message: (err as Error).message || "Could not create link", type: "error" });
    } finally {
      setCreating(false);
    }
  }

  async function copyLink(url: string, code: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500);
    } catch {
      toast({ message: "Copy failed — select and copy manually", type: "error" });
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl">
        <SkeletonText className="mb-6 h-8 w-48" />
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
        <SkeletonCard className="h-48" />
      </div>
    );
  }

  const stats = [
    { label: "Clicks", value: data?.totalClicks ?? 0, icon: MousePointerClick },
    { label: "Signups", value: data?.totalSignups ?? 0, icon: UserPlus },
    { label: "Conversions", value: data?.totalConversions ?? 0, icon: Users },
    { label: "Points earned", value: data?.totalRewards ?? 0, icon: Trophy },
  ];

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 flex items-center gap-2 font-display text-2xl font-semibold tracking-tight text-foreground">
        <Share2 className="h-6 w-6 text-primary" /> Referrals
      </h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Share your link and earn points every time someone you refer signs up and converts.
      </p>

      {/* Stat cards */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex flex-col gap-2 p-4">
              <s.icon className="h-5 w-5 text-primary" aria-hidden="true" />
              <span className="font-display text-2xl font-bold text-foreground">{s.value}</span>
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Create link */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-base">Create a referral link</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="referral-slug">Custom slug (optional)</Label>
              <Input
                id="referral-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="my-awesome-link"
                maxLength={50}
                pattern="[a-zA-Z0-9-]*"
              />
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create link"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Existing links */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your links</CardTitle>
        </CardHeader>
        <CardContent>
          {!data || data.links.length === 0 ? (
            <div className="py-10 text-center">
              <Share2
                className="mx-auto mb-3 h-9 w-9 text-muted-foreground/40"
                aria-hidden="true"
              />
              <p className="text-sm text-muted-foreground">
                No referral links yet. Create one above to get started.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {data.links.map((link) => {
                const url = `${data.referralUrlBase}${link.slug}`;
                return (
                  <li key={link.code} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-sm text-foreground">{url}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {link.clicks} clicks · {link.signups} signups · {link.conversions}{" "}
                        conversions · {link.rewardsEarned} pts
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => copyLink(url, link.code)}
                    >
                      {copied === link.code ? (
                        <>
                          <Check className="h-4 w-4" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" /> Copy
                        </>
                      )}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

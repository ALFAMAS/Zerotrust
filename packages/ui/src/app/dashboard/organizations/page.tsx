"use client";
import Link from "next/link";
import { useState } from "react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { SkeletonCard } from "@/components/Skeleton";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/States";
import { Input } from "@/components/ui/input";
import { useToast } from "@/context/ToastContext";
import {
  useCreateOrganizationMutation,
  useOrganizationsListQuery,
} from "@/lib/server-state/organizations";

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-indigo-900 text-indigo-200 border border-indigo-700",
  admin: "bg-blue-900 text-blue-200 border border-blue-700",
  member: "bg-muted text-foreground/80 border border-border",
  viewer: "bg-card text-muted-foreground border border-border",
};

export default function OrganizationsPage() {
  const { toast } = useToast();
  const orgsQuery = useOrganizationsListQuery();
  const createMutation = useCreateOrganizationMutation();

  const orgs = orgsQuery.data?.orgs ?? [];
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);

  function autoSlug(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/[\s]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function handleNameChange(v: string) {
    setOrgName(v);
    if (!slugManual) {
      setOrgSlug(autoSlug(v));
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgName.trim()) return;
    try {
      await createMutation.mutateAsync({
        name: orgName.trim(),
        slug: orgSlug || undefined,
      });
      setOrgName("");
      setOrgSlug("");
      setSlugManual(false);
      setShowCreateForm(false);
      toast({ message: "Organization created!", type: "success" });
    } catch (err: unknown) {
      toast({
        message: err instanceof Error ? err.message : "Failed to create organization",
        type: "error",
      });
    }
  }

  if (orgsQuery.error && !orgsQuery.data) {
    return (
      <ErrorState
        message={orgsQuery.error.message || "Failed to load organizations"}
        retry={() => void orgsQuery.refetch()}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Organizations
        </h1>
        <Button
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className="text-sm bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg transition-colors"
        >
          {showCreateForm ? "Cancel" : "Create organization"}
        </Button>
      </div>

      <ServerStateStatus
        isFetching={orgsQuery.isFetching}
        isStale={orgsQuery.isStale}
        hasData={orgs.length > 0}
        label="organizations"
        onRefresh={() => void orgsQuery.refetch()}
      />

      {showCreateForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 bg-card border border-border rounded-xl p-5 space-y-4"
        >
          <h2 className="text-sm font-semibold text-foreground">New organization</h2>
          <div className="space-y-1">
            <label htmlFor="page-f0" className="text-xs text-muted-foreground">
              Name
            </label>
            <Input
              id="page-f0"
              value={orgName}
              onChange={(e) => handleNameChange(e.target.value)}
              required
              placeholder="Acme Corp"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="page-f1" className="text-xs text-muted-foreground">
              Slug (optional — auto-generated from name)
            </label>
            <Input
              id="page-f1"
              value={orgSlug}
              onChange={(e) => {
                setSlugManual(true);
                setOrgSlug(e.target.value);
              }}
              placeholder={autoSlug(orgName) || "acme-corp"}
              pattern="[a-z0-9-]{3,50}"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring font-mono"
            />
            {orgSlug && (
              <p className="text-xs text-muted-foreground">
                Preview: <span className="text-primary">{orgSlug}</span>
              </p>
            )}
          </div>
          <Button
            type="submit"
            disabled={createMutation.isPending || !orgName.trim()}
            className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {createMutation.isPending ? "Creating…" : "Create"}
          </Button>
        </form>
      )}

      {orgsQuery.isLoading ? (
        <div className="space-y-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : orgs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="mb-3">You don&apos;t belong to any organizations yet.</p>
          <Button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="text-sm text-primary hover:text-primary/80 underline"
          >
            Create your first organization
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {orgs.map(({ org, member }) => (
            <Link
              key={org.id}
              href={`/dashboard/organizations/${org.id}`}
              className="block bg-card border border-border rounded-xl p-5 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{org.name}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        ROLE_COLORS[member.role] ?? ROLE_COLORS.member
                      }`}
                    >
                      {member.role}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 font-mono">{org.slug}</p>
                </div>
                <svg
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-4 h-4 text-muted-foreground"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

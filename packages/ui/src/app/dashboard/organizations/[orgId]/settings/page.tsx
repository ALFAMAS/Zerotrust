"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "../../../../../lib/api";
import { SkeletonCard } from "@/components/Skeleton";
import { useToast } from "@/context/ToastContext";

interface OrgDetails {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  billingEmail: string | null;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MemberRow {
  member: {
    id: string;
    userId: string;
    role: string;
  };
  user: {
    id: string;
    email: string;
    displayName: string;
  };
}

interface CurrentUser {
  id: string;
  email: string;
}

export default function OrgSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const orgId = params.orgId as string;

  const [org, setOrg] = useState<OrgDetails | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [myRole, setMyRole] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editBillingEmail, setEditBillingEmail] = useState("");
  const [editLogoUrl, setEditLogoUrl] = useState("");
  const [saving, setSaving] = useState(false);

  // Transfer form state
  const [transferTo, setTransferTo] = useState("");
  const [transferring, setTransferring] = useState(false);

  // Delete form state
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [orgRes, meRes, membersRes] = await Promise.all([
          api.get<{ org: OrgDetails; memberCount: number }>(`/orgs/${orgId}`),
          api.get<CurrentUser>("/auth/me"),
          api.get<{ members: MemberRow[] }>(`/orgs/${orgId}/members`),
        ]);

        setOrg(orgRes.org);
        setEditName(orgRes.org.name);
        setEditBillingEmail(orgRes.org.billingEmail ?? "");
        setEditLogoUrl(orgRes.org.logoUrl ?? "");
        setMembers(membersRes.members);

        const me = membersRes.members.find((r) => r.user.id === meRes.id);
        setMyRole(me?.member.role ?? "");
      } catch {
        // handled
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, [orgId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.put<{ org: OrgDetails }>(`/orgs/${orgId}`, {
        name: editName || undefined,
        billingEmail: editBillingEmail || undefined,
        logoUrl: editLogoUrl || undefined,
      });
      setOrg(res.org);
      toast({ message: "Settings saved", type: "success" });
    } catch (err: any) {
      toast({ message: err.message || "Failed to save settings", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!transferTo) return;
    if (!confirm("Transfer ownership? You will become an admin.")) return;
    setTransferring(true);
    try {
      await api.post(`/orgs/${orgId}/transfer`, { newOwnerId: transferTo });
      toast({ message: "Ownership transferred", type: "success" });
      router.push(`/dashboard/organizations/${orgId}`);
    } catch (err: any) {
      toast({ message: err.message || "Failed to transfer ownership", type: "error" });
    } finally {
      setTransferring(false);
    }
  }

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!org || deleteConfirm !== org.name) return;
    setDeleting(true);
    try {
      await api.delete(`/orgs/${orgId}`);
      toast({ message: "Organization deleted", type: "success" });
      router.push("/dashboard/organizations");
    } catch (err: any) {
      toast({ message: err.message || "Failed to delete organization", type: "error" });
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!org) {
    return <div className="text-muted-foreground py-16 text-center">Organization not found.</div>;
  }

  if (myRole !== "admin" && myRole !== "owner") {
    return (
      <div className="text-muted-foreground py-16 text-center">
        <p className="font-semibold text-foreground mb-1">Access denied</p>
        <p>You need admin or owner access to view settings.</p>
      </div>
    );
  }

  const nonOwnerMembers = members.filter((m) => m.member.role !== "owner");

  return (
    <div className="space-y-8 max-w-xl">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">{org.name} — Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5 font-mono">{org.slug}</p>
      </div>

      {/* General settings */}
      <form
        onSubmit={handleSave}
        className="bg-card border border-border rounded-xl p-5 space-y-4"
      >
        <h2 className="font-semibold text-foreground">General</h2>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Organization name</label>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Billing email</label>
          <input
            type="email"
            value={editBillingEmail}
            onChange={(e) => setEditBillingEmail(e.target.value)}
            placeholder="billing@example.com"
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Logo URL</label>
          <input
            type="url"
            value={editLogoUrl}
            onChange={(e) => setEditLogoUrl(e.target.value)}
            placeholder="https://example.com/logo.png"
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm px-4 py-2 rounded-lg transition-colors"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>

      {/* Transfer ownership — owner only */}
      {myRole === "owner" && nonOwnerMembers.length > 0 && (
        <form
          onSubmit={handleTransfer}
          className="bg-card border border-border rounded-xl p-5 space-y-4"
        >
          <h2 className="font-semibold text-foreground">Transfer ownership</h2>
          <p className="text-sm text-muted-foreground">
            You will become an admin after transferring ownership.
          </p>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">New owner</label>
            <select
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
              required
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring"
            >
              <option value="">Select a member…</option>
              {nonOwnerMembers.map(({ member, user }) => (
                <option key={member.userId} value={member.userId}>
                  {user.displayName} ({user.email}) — {member.role}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={!transferTo || transferring}
            className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-foreground text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {transferring ? "Transferring…" : "Transfer ownership"}
          </button>
        </form>
      )}

      {/* Delete organization — owner only */}
      {myRole === "owner" && (
        <form
          onSubmit={handleDelete}
          className="bg-card border border-red-900 rounded-xl p-5 space-y-4"
        >
          <h2 className="font-semibold text-red-400">Delete organization</h2>
          <p className="text-sm text-muted-foreground">
            This is irreversible. All members and invites will be removed. Type the organization
            name to confirm.
          </p>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">
              Type <span className="font-mono text-foreground">{org.name}</span> to confirm
            </label>
            <input
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder={org.name}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-red-500"
            />
          </div>
          <button
            type="submit"
            disabled={deleteConfirm !== org.name || deleting}
            className="bg-red-700 hover:bg-red-600 disabled:opacity-50 text-foreground text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {deleting ? "Deleting…" : "Delete organization"}
          </button>
        </form>
      )}
    </div>
  );
}

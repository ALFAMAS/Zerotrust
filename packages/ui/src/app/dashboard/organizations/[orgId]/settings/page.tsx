"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SkeletonCard } from "@/components/Skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/context/ToastContext";
import { api } from "../../../../../lib/api";

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

interface SecurityPolicy {
  orgId: string;
  requirePasskeyAttestation: boolean;
  requireHardwarePasskey: boolean;
  allowedPasskeyAaguids: string[];
  deniedPasskeyAaguids: string[];
  ipAllowlist: string[];
  maxSessionAgeSeconds: number;
  idleTimeoutSeconds: number;
  maxConcurrentSessions: number;
  allowedCountries: string[];
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

  // Passkey security policy state
  const [policy, setPolicy] = useState<SecurityPolicy | null>(null);
  const [allowedAaguids, setAllowedAaguids] = useState("");
  const [deniedAaguids, setDeniedAaguids] = useState("");
  const [ipAllowlist, setIpAllowlist] = useState("");
  const [allowedCountries, setAllowedCountries] = useState("");
  const [savingPolicy, setSavingPolicy] = useState(false);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [orgRes, meRes, membersRes, policyRes] = await Promise.all([
          api.get<{ org: OrgDetails; memberCount: number }>(`/orgs/${orgId}`),
          api.get<CurrentUser>("/auth/me"),
          api.get<{ data: MemberRow[]; pagination: any }>(`/orgs/${orgId}/members`),
          api.get<{ policy: SecurityPolicy }>(`/orgs/${orgId}/security/policy`).catch(() => null),
        ]);

        setOrg(orgRes.org);
        setEditName(orgRes.org.name);
        setEditBillingEmail(orgRes.org.billingEmail ?? "");
        setEditLogoUrl(orgRes.org.logoUrl ?? "");
        setMembers(membersRes.data ?? []);

        if (policyRes?.policy) {
          setPolicy(policyRes.policy);
          setAllowedAaguids((policyRes.policy.allowedPasskeyAaguids ?? []).join(", "));
          setDeniedAaguids((policyRes.policy.deniedPasskeyAaguids ?? []).join(", "));
          setIpAllowlist((policyRes.policy.ipAllowlist ?? []).join(", "));
          setAllowedCountries((policyRes.policy.allowedCountries ?? []).join(", "));
        }

        const me = (membersRes.data ?? []).find((r) => r.user.id === meRes.id);
        setMyRole(me?.member.role ?? "");
      } catch {
        // handled
      } finally {
        setLoading(false);
      }
    }
    fetchAll();
  }, [orgId]);

  async function handleSavePolicy(e: React.FormEvent) {
    e.preventDefault();
    if (!policy) return;
    setSavingPolicy(true);
    try {
      const parseList = (s: string) =>
        s
          .split(/[\s,]+/)
          .map((x) => x.trim().toLowerCase())
          .filter(Boolean);
      const parseCountries = (s: string) =>
        s
          .split(/[\s,]+/)
          .map((x) => x.trim().toUpperCase())
          .filter(Boolean);
      const res = await api.put<{ policy: SecurityPolicy }>(`/orgs/${orgId}/security/policy`, {
        requirePasskeyAttestation: policy.requirePasskeyAttestation,
        requireHardwarePasskey: policy.requireHardwarePasskey,
        allowedPasskeyAaguids: parseList(allowedAaguids),
        deniedPasskeyAaguids: parseList(deniedAaguids),
        ipAllowlist: parseList(ipAllowlist),
        maxSessionAgeSeconds: policy.maxSessionAgeSeconds || 0,
        idleTimeoutSeconds: policy.idleTimeoutSeconds || 0,
        maxConcurrentSessions: policy.maxConcurrentSessions || 0,
        allowedCountries: parseCountries(allowedCountries),
      });
      setPolicy(res.policy);
      setIpAllowlist((res.policy.ipAllowlist ?? []).join(", "));
      setAllowedCountries((res.policy.allowedCountries ?? []).join(", "));
      toast({ message: "Security policy saved", type: "success" });
    } catch (err: any) {
      toast({ message: err.message || "Failed to save passkey policy", type: "error" });
    } finally {
      setSavingPolicy(false);
    }
  }

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
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {org.name} — Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5 font-mono">{org.slug}</p>
      </div>

      {/* General settings */}
      <form onSubmit={handleSave} className="bg-card border border-border rounded-xl p-5 space-y-4">
        <h2 className="font-semibold text-foreground">General</h2>
        <div className="space-y-1">
          <label htmlFor="page-f0" className="text-xs text-muted-foreground">
            Organization name
          </label>
          <input
            id="page-f0"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="page-f1" className="text-xs text-muted-foreground">
            Billing email
          </label>
          <input
            id="page-f1"
            type="email"
            value={editBillingEmail}
            onChange={(e) => setEditBillingEmail(e.target.value)}
            placeholder="billing@example.com"
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="page-f2" className="text-xs text-muted-foreground">
            Logo URL
          </label>
          <input
            id="page-f2"
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

      {/* Passkey security policy — admin+ */}
      {policy && (
        <form
          onSubmit={handleSavePolicy}
          className="bg-card border border-border rounded-xl p-5 space-y-4"
        >
          <div>
            <h2 className="font-semibold text-foreground">Security policy</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Passkey requirements (enforced via FIDO MDS3 attestation at registration) and an
              optional IP allowlist for organization access.
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={policy.requirePasskeyAttestation}
              onChange={(e) =>
                setPolicy({ ...policy, requirePasskeyAttestation: e.target.checked })
              }
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span className="text-sm text-foreground">
              Require attestation
              <span className="block text-xs text-muted-foreground">
                Reject passkeys that can&apos;t prove their authenticator model (no self/none
                attestation).
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={policy.requireHardwarePasskey}
              onChange={(e) => setPolicy({ ...policy, requireHardwarePasskey: e.target.checked })}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span className="text-sm text-foreground">
              Hardware keys only
              <span className="block text-xs text-muted-foreground">
                Only allow FIDO-certified hardware security keys (e.g. YubiKey).
              </span>
            </span>
          </label>

          <div className="space-y-1">
            <label htmlFor="page-f3" className="text-xs text-muted-foreground">
              Allowed AAGUIDs (comma or space separated — leave blank to allow all)
            </label>
            <input
              id="page-f3"
              value={allowedAaguids}
              onChange={(e) => setAllowedAaguids(e.target.value)}
              placeholder="ee882879-721c-4913-9775-3dfcce97072a"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="page-f4" className="text-xs text-muted-foreground">
              Denied AAGUIDs
            </label>
            <input
              id="page-f4"
              value={deniedAaguids}
              onChange={(e) => setDeniedAaguids(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
            />
          </div>

          <div className="border-t border-border pt-4 space-y-1">
            <label htmlFor="page-f5" className="text-xs text-muted-foreground">
              IP allowlist (IPv4 CIDRs, comma or space separated — leave blank to allow all)
            </label>
            <input
              id="page-f5"
              value={ipAllowlist}
              onChange={(e) => setIpAllowlist(e.target.value)}
              placeholder="203.0.113.0/24, 198.51.100.10"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
            />
            <p className="text-xs text-amber-500/90">
              ⚠ When set, all access to this organization is restricted to these ranges — including
              this settings page. Make sure your current IP is included.
            </p>
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-sm font-medium text-foreground">Session &amp; device policy</p>
            <p className="text-xs text-muted-foreground -mt-2">
              Applies to every member of this organization. Use 0 for no limit.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label htmlFor="page-f6" className="text-xs text-muted-foreground">
                  Max session age (minutes)
                </label>
                <input
                  id="page-f6"
                  type="number"
                  min={0}
                  value={Math.round((policy.maxSessionAgeSeconds ?? 0) / 60)}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      maxSessionAgeSeconds: Math.max(0, Number(e.target.value) || 0) * 60,
                    })
                  }
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="page-f7" className="text-xs text-muted-foreground">
                  Idle timeout (minutes)
                </label>
                <input
                  id="page-f7"
                  type="number"
                  min={0}
                  value={Math.round((policy.idleTimeoutSeconds ?? 0) / 60)}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      idleTimeoutSeconds: Math.max(0, Number(e.target.value) || 0) * 60,
                    })
                  }
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="page-f8" className="text-xs text-muted-foreground">
                  Max concurrent sessions
                </label>
                <input
                  id="page-f8"
                  type="number"
                  min={0}
                  value={policy.maxConcurrentSessions ?? 0}
                  onChange={(e) =>
                    setPolicy({
                      ...policy,
                      maxConcurrentSessions: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="page-f9" className="text-xs text-muted-foreground">
                Allowed countries (ISO 3166-1 alpha-2, comma or space separated — leave blank to
                allow all)
              </label>
              <input
                id="page-f9"
                value={allowedCountries}
                onChange={(e) => setAllowedCountries(e.target.value)}
                placeholder="US, GB, DE"
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono uppercase text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={savingPolicy}
            className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {savingPolicy ? "Saving…" : "Save security policy"}
          </button>
        </form>
      )}

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
            <span className="text-xs text-muted-foreground">New owner</span>
            <Select value={transferTo} onValueChange={setTransferTo}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a member…" />
              </SelectTrigger>
              <SelectContent>
                {nonOwnerMembers.map(({ member, user }) => (
                  <SelectItem key={member.userId} value={member.userId}>
                    {user.displayName} ({user.email}) — {member.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <label htmlFor="page-f12" className="text-xs text-muted-foreground">
              Type <span className="font-mono text-foreground">{org.name}</span> to confirm
            </label>
            <input
              id="page-f12"
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

"use client";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SkeletonCard } from "@/components/Skeleton";
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

interface ScimToken {
  id: string;
  orgId: string;
  name: string;
  tokenPrefix: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdBy: string | null;
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

  // SCIM token state — admin+ can list, generate, rotate, revoke
  const [scimTokens, setScimTokens] = useState<ScimToken[]>([]);
  const [newScimName, setNewScimName] = useState("");
  const [creatingScimToken, setCreatingScimToken] = useState(false);
  // Plaintext of a freshly created/rotated token — surfaced once, then cleared.
  const [revealedPlaintext, setRevealedPlaintext] = useState<string | null>(null);
  const [revealedTokenName, setRevealedTokenName] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAll() {
      try {
        const [orgRes, meRes, membersRes, policyRes, scimRes] = await Promise.all([
          api.get<{ org: OrgDetails; memberCount: number }>(`/orgs/${orgId}`),
          api.get<CurrentUser>("/auth/me"),
          api.get<{ members: MemberRow[] }>(`/orgs/${orgId}/members`),
          api.get<{ policy: SecurityPolicy }>(`/orgs/${orgId}/security/policy`).catch(() => null),
          api.get<{ tokens: ScimToken[] }>(`/orgs/${orgId}/scim/tokens`).catch(() => null),
        ]);

        setOrg(orgRes.org);
        setEditName(orgRes.org.name);
        setEditBillingEmail(orgRes.org.billingEmail ?? "");
        setEditLogoUrl(orgRes.org.logoUrl ?? "");
        setMembers(membersRes.members);

        if (policyRes?.policy) {
          setPolicy(policyRes.policy);
          setAllowedAaguids((policyRes.policy.allowedPasskeyAaguids ?? []).join(", "));
          setDeniedAaguids((policyRes.policy.deniedPasskeyAaguids ?? []).join(", "));
          setIpAllowlist((policyRes.policy.ipAllowlist ?? []).join(", "));
          setAllowedCountries((policyRes.policy.allowedCountries ?? []).join(", "));
        }

        setScimTokens(scimRes?.tokens ?? []);

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

  async function handleCreateScimToken(e: React.FormEvent) {
    e.preventDefault();
    if (!newScimName.trim()) return;
    setCreatingScimToken(true);
    try {
      const res = await api.post<{ token: ScimToken; plaintext: string }>(
        `/orgs/${orgId}/scim/tokens`,
        { name: newScimName.trim() }
      );
      setScimTokens((prev) => [res.token, ...prev]);
      setNewScimName("");
      setRevealedPlaintext(res.plaintext);
      setRevealedTokenName(res.token.name);
    } catch (err: any) {
      toast({ message: err.message || "Failed to create SCIM token", type: "error" });
    } finally {
      setCreatingScimToken(false);
    }
  }

  async function handleRotateScimToken(tokenId: string) {
    if (!confirm("Rotate this token? The current token will stop working immediately.")) return;
    try {
      const res = await api.post<{ token: ScimToken; plaintext: string }>(
        `/orgs/${orgId}/scim/tokens/${tokenId}/rotate`,
        {}
      );
      setScimTokens((prev) => [res.token, ...prev.filter((t) => t.id !== tokenId)]);
      setRevealedPlaintext(res.plaintext);
      setRevealedTokenName(res.token.name);
    } catch (err: any) {
      toast({ message: err.message || "Failed to rotate SCIM token", type: "error" });
    }
  }

  async function handleRevokeScimToken(tokenId: string) {
    if (!confirm("Revoke this token? It will stop working immediately and cannot be undone."))
      return;
    try {
      await api.delete(`/orgs/${orgId}/scim/tokens/${tokenId}`);
      setScimTokens((prev) =>
        prev.map((t) => (t.id === tokenId ? { ...t, revokedAt: new Date().toISOString() } : t))
      );
      toast({ message: "SCIM token revoked", type: "success" });
    } catch (err: any) {
      toast({ message: err.message || "Failed to revoke SCIM token", type: "error" });
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
            <label className="text-xs text-muted-foreground">
              Allowed AAGUIDs (comma or space separated — leave blank to allow all)
            </label>
            <input
              value={allowedAaguids}
              onChange={(e) => setAllowedAaguids(e.target.value)}
              placeholder="ee882879-721c-4913-9775-3dfcce97072a"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Denied AAGUIDs</label>
            <input
              value={deniedAaguids}
              onChange={(e) => setDeniedAaguids(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
            />
          </div>

          <div className="border-t border-border pt-4 space-y-1">
            <label className="text-xs text-muted-foreground">
              IP allowlist (IPv4 CIDRs, comma or space separated — leave blank to allow all)
            </label>
            <input
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
                <label className="text-xs text-muted-foreground">Max session age (minutes)</label>
                <input
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
                <label className="text-xs text-muted-foreground">Idle timeout (minutes)</label>
                <input
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
                <label className="text-xs text-muted-foreground">Max concurrent sessions</label>
                <input
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
              <label className="text-xs text-muted-foreground">
                Allowed countries (ISO 3166-1 alpha-2, comma or space separated — leave blank to
                allow all)
              </label>
              <input
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

      {/* SCIM tokens — admin+ can list/generate/rotate/revoke. SCIM 2.0 (RFC 7644)
                    bearer tokens authenticate provisioning requests from the org's IdP
                    (Okta, Azure AD, Google Workspace) against /scim/v2. The plaintext
                    is shown exactly once after create/rotate. */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-foreground">SCIM provisioning tokens</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Per-org bearer tokens for SCIM 2.0 user provisioning. Paste one into your IdP&apos;s
            SCIM configuration to provision users into this organization.
          </p>
        </div>

        {/* Plaintext reveal — surfaces once after create/rotate, then dismissed. */}
        {revealedPlaintext && (
          <div className="border border-amber-500/40 bg-amber-500/5 rounded-lg p-4 space-y-2">
            <p className="text-sm font-semibold text-amber-500">
              New token for &quot;{revealedTokenName}&quot; — copy it now, it won&apos;t be shown
              again
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-muted border border-border rounded px-3 py-2 text-xs font-mono text-foreground break-all">
                {revealedPlaintext}
              </code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(revealedPlaintext);
                  toast({ message: "Copied to clipboard", type: "success" });
                }}
                className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs px-3 py-2 rounded-lg transition-colors"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={() => {
                  setRevealedPlaintext(null);
                  setRevealedTokenName(null);
                }}
                className="bg-muted hover:bg-muted/70 text-foreground text-xs px-3 py-2 rounded-lg transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Existing tokens */}
        {scimTokens.length > 0 && (
          <div className="space-y-2">
            {scimTokens.map((t) => {
              const isRevoked = !!t.revokedAt;
              const isExpired = t.expiresAt ? new Date(t.expiresAt) < new Date() : false;
              const status = isRevoked ? "revoked" : isExpired ? "expired" : "active";
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 bg-muted border border-border rounded-lg px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-foreground truncate">{t.name}</span>
                      <span
                        className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                          status === "active"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : status === "expired"
                              ? "bg-amber-500/15 text-amber-400"
                              : "bg-red-500/15 text-red-400"
                        }`}
                      >
                        {status}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">
                      {t.tokenPrefix}
                      {t.lastUsedAt
                        ? ` · last used ${new Date(t.lastUsedAt).toLocaleString()}`
                        : " · never used"}
                      {t.expiresAt
                        ? ` · expires ${new Date(t.expiresAt).toLocaleDateString()}`
                        : ""}
                    </div>
                  </div>
                  {!isRevoked && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRotateScimToken(t.id)}
                        className="bg-muted hover:bg-muted/70 border border-border text-foreground text-xs px-3 py-1.5 rounded transition-colors"
                      >
                        Rotate
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevokeScimToken(t.id)}
                        className="bg-red-700 hover:bg-red-600 text-foreground text-xs px-3 py-1.5 rounded transition-colors"
                      >
                        Revoke
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Issue new token */}
        <form
          onSubmit={handleCreateScimToken}
          className="flex items-end gap-3 border-t border-border pt-4"
        >
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground">New token name</label>
            <input
              value={newScimName}
              onChange={(e) => setNewScimName(e.target.value)}
              placeholder="e.g. Okta production"
              maxLength={80}
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
            />
          </div>
          <button
            type="submit"
            disabled={!newScimName.trim() || creatingScimToken}
            className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {creatingScimToken ? "Generating…" : "Generate token"}
          </button>
        </form>
      </div>

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

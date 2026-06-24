"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SkeletonCard, SkeletonTable } from "@/components/Skeleton";
import { useToast } from "@/context/ToastContext";
import { api } from "../../../../lib/api";

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
    orgId: string;
    userId: string;
    role: string;
    joinedAt: string | null;
    createdAt: string;
  };
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

interface Invite {
  id: string;
  orgId: string;
  email: string;
  role: string;
  token: string;
  expiresAt: string;
  createdAt: string;
}

interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
}

const ROLE_COLORS: Record<string, string> = {
  owner: "bg-indigo-900 text-indigo-200 border border-indigo-700",
  admin: "bg-blue-900 text-blue-200 border border-blue-700",
  member: "bg-muted text-foreground/80 border border-border",
  viewer: "bg-card text-muted-foreground border border-border",
};

export default function OrgDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const orgId = params.orgId as string;

  const [org, setOrg] = useState<OrgDetails | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [myRole, setMyRole] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);

  const isAdminOrOwner = myRole === "admin" || myRole === "owner";

  async function fetchAll() {
    setLoading(true);
    try {
      const [orgRes, meRes, membersRes] = await Promise.all([
        api.get<{ org: OrgDetails; memberCount: number }>(`/orgs/${orgId}`),
        api.get<CurrentUser>("/auth/me"),
        api.get<{ members: MemberRow[] }>(`/orgs/${orgId}/members`),
      ]);

      setOrg(orgRes.org);
      setMemberCount(orgRes.memberCount);
      setCurrentUser(meRes);
      setMembers(membersRes.members);

      const me = membersRes.members.find((r) => r.user.id === meRes.id);
      setMyRole(me?.member.role ?? "");

      if (me && (me.member.role === "admin" || me.member.role === "owner")) {
        const invRes = await api.get<{ invites: Invite[] }>(`/orgs/${orgId}/invites`);
        setInvites(invRes.invites);
      }
    } catch {
      // handled below
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAll();
    // biome-ignore lint/correctness/useExhaustiveDependencies: fetch on orgId change only
  }, [fetchAll]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await api.post(`/orgs/${orgId}/invites`, { email: inviteEmail.trim(), role: inviteRole });
      toast({ message: "Invite sent!", type: "success" });
      setInviteEmail("");
      fetchAll();
    } catch (err: any) {
      toast({ message: err.message || "Failed to send invite", type: "error" });
    } finally {
      setInviting(false);
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    if (!confirm("Revoke this invite?")) return;
    try {
      await api.delete(`/orgs/${orgId}/invites/${inviteId}`);
      toast({ message: "Invite revoked", type: "success" });
      fetchAll();
    } catch (err: any) {
      toast({ message: err.message || "Failed to revoke invite", type: "error" });
    }
  }

  async function handleLeave() {
    if (!currentUser) return;
    if (!confirm("Leave this organization?")) return;
    try {
      await api.delete(`/orgs/${orgId}/members/${currentUser.id}`);
      toast({ message: "You left the organization", type: "success" });
      router.push("/dashboard/organizations");
    } catch (err: any) {
      toast({ message: err.message || "Failed to leave", type: "error" });
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonTable rows={4} columns={4} />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="text-muted-foreground py-16 text-center">
        Organization not found or you do not have access.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {org.name}
            </h1>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                ROLE_COLORS[myRole] ?? ROLE_COLORS.member
              }`}
            >
              {myRole}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">{org.slug}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {memberCount} member{memberCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdminOrOwner && (
            <Link
              href={`/dashboard/organizations/${orgId}/settings`}
              className="text-sm text-muted-foreground hover:text-foreground border border-border px-3 py-1.5 rounded-lg hover:bg-accent transition-colors"
            >
              Settings
            </Link>
          )}
          {myRole !== "owner" && (
            <button
              type="button"
              onClick={handleLeave}
              className="text-sm text-red-400 hover:text-red-300 border border-red-800 px-3 py-1.5 rounded-lg hover:bg-red-950 transition-colors"
            >
              Leave
            </button>
          )}
        </div>
      </div>

      {/* Members table */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3">Members</h2>
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-4 py-2 border-b border-border text-xs text-muted-foreground font-medium uppercase tracking-wide">
            <span>Avatar</span>
            <span>Name / Email</span>
            <span>Role</span>
            <span>Joined</span>
          </div>
          {members.length === 0 ? (
            <p className="px-4 py-6 text-muted-foreground text-sm">No members found.</p>
          ) : (
            members.map(({ member, user }) => (
              <div
                key={member.id}
                className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-4 py-3 items-center border-b border-border last:border-b-0"
              >
                {/* Avatar placeholder */}
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-xs text-primary font-medium flex-shrink-0">
                  {(user.displayName || user.email)[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm text-foreground truncate">{user.displayName}</div>
                  <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                    ROLE_COLORS[member.role] ?? ROLE_COLORS.member
                  }`}
                >
                  {member.role}
                </span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {member.joinedAt ? new Date(member.joinedAt).toLocaleString() : "—"}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Invite section — admin/owner only */}
      {isAdminOrOwner && (
        <div>
          <h2 className="text-base font-semibold text-foreground mb-3">Invite member</h2>
          <form
            onSubmit={handleInvite}
            className="bg-card border border-border rounded-xl p-4 flex flex-wrap gap-3 items-end"
          >
            <div className="flex-1 min-w-48 space-y-1">
              <label htmlFor="page-f0" className="text-xs text-muted-foreground">
                Email
              </label>
              <input
                id="page-f0"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                required
                placeholder="colleague@example.com"
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="page-f1" className="text-xs text-muted-foreground">
                Role
              </label>
              <select
                id="page-f1"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring"
              >
                <option value="viewer">Viewer</option>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={inviting}
              className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm px-4 py-2 rounded-lg transition-colors"
            >
              {inviting ? "Sending…" : "Send invite"}
            </button>
          </form>
        </div>
      )}

      {/* Pending invites table — admin/owner only */}
      {isAdminOrOwner && invites.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-foreground mb-3">Pending invites</h2>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2 border-b border-border text-xs text-muted-foreground font-medium uppercase tracking-wide">
              <span>Email</span>
              <span>Role</span>
              <span>Expires</span>
              <span></span>
            </div>
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-3 items-center border-b border-border last:border-b-0"
              >
                <span className="text-sm text-foreground truncate">{invite.email}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${
                    ROLE_COLORS[invite.role] ?? ROLE_COLORS.member
                  }`}
                >
                  {invite.role}
                </span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {new Date(invite.expiresAt).toLocaleDateString()}
                </span>
                <button
                  type="button"
                  onClick={() => handleRevokeInvite(invite.id)}
                  className="text-xs text-red-400 hover:text-red-300 border border-red-800 px-2 py-0.5 rounded hover:bg-red-950 transition-colors whitespace-nowrap"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

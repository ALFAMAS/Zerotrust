"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { SkeletonCard, SkeletonTable } from "@/components/Skeleton";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/States";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/context/ToastContext";
import { useAuthMeQuery } from "@/lib/server-state/auth";
import {
  useCreateOrgInviteMutation,
  useLeaveOrganizationMutation,
  useOrganizationDetailQuery,
  useOrganizationInvitesQuery,
  useOrganizationMembersQuery,
  useRevokeOrgInviteMutation,
} from "@/lib/server-state/organizations";

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

  const meQuery = useAuthMeQuery();
  const detailQuery = useOrganizationDetailQuery(orgId);
  const membersQuery = useOrganizationMembersQuery(orgId);

  const members = membersQuery.data?.data ?? [];
  const myRole = useMemo(() => {
    const me = members.find((m) => m.member.userId === meQuery.data?.id);
    return me?.member.role ?? "";
  }, [members, meQuery.data?.id]);

  const isAdminOrOwner = myRole === "admin" || myRole === "owner";
  const invitesQuery = useOrganizationInvitesQuery(orgId, isAdminOrOwner);
  const createInviteMutation = useCreateOrgInviteMutation(orgId);
  const revokeInviteMutation = useRevokeOrgInviteMutation(orgId);
  const leaveMutation = useLeaveOrganizationMutation(orgId);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");

  const org = detailQuery.data?.org ?? null;
  const memberCount = detailQuery.data?.memberCount ?? 0;
  const invites = invitesQuery.data?.data ?? [];

  const loading =
    detailQuery.isPending || membersQuery.isPending || meQuery.isPending;
  const queryError =
    (detailQuery.error && !detailQuery.data) ||
    (membersQuery.error && !membersQuery.data);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    try {
      await createInviteMutation.mutateAsync({
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      toast({ message: "Invite sent!", type: "success" });
      setInviteEmail("");
    } catch (err: unknown) {
      toast({
        message: err instanceof Error ? err.message : "Failed to send invite",
        type: "error",
      });
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    if (!confirm("Revoke this invite?")) return;
    try {
      await revokeInviteMutation.mutateAsync(inviteId);
      toast({ message: "Invite revoked", type: "success" });
    } catch (err: unknown) {
      toast({
        message: err instanceof Error ? err.message : "Failed to revoke invite",
        type: "error",
      });
    }
  }

  async function handleLeave() {
    if (!meQuery.data) return;
    if (!confirm("Leave this organization?")) return;
    try {
      await leaveMutation.mutateAsync(meQuery.data.id);
      toast({ message: "You left the organization", type: "success" });
      router.push("/dashboard/organizations");
    } catch (err: unknown) {
      toast({
        message: err instanceof Error ? err.message : "Failed to leave",
        type: "error",
      });
    }
  }

  if (queryError) {
    const message =
      detailQuery.error?.message ||
      membersQuery.error?.message ||
      "Failed to load organization";
    return (
      <ErrorState
        message={message}
        retry={() => {
          void detailQuery.refetch();
          void membersQuery.refetch();
        }}
      />
    );
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
      <ServerStateStatus
        isFetching={detailQuery.isFetching || membersQuery.isFetching}
        isStale={detailQuery.isStale || membersQuery.isStale}
        dataUpdatedAt={Math.max(detailQuery.dataUpdatedAt, membersQuery.dataUpdatedAt)}
      />

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
            <Button
              type="button"
              variant="destructive"
              onClick={handleLeave}
              disabled={leaveMutation.isPending}
            >
              Leave
            </Button>
          )}
        </div>
      </div>

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
              <Input
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
              <span className="text-xs text-muted-foreground">Role</span>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Viewer</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={createInviteMutation.isPending}>
              {createInviteMutation.isPending ? "Sending…" : "Send invite"}
            </Button>
          </form>
        </div>
      )}

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
                <Button
                  type="button"
                  variant="destructive"
                  className="text-xs px-2 py-0.5 h-auto whitespace-nowrap"
                  onClick={() => handleRevokeInvite(invite.id)}
                  disabled={revokeInviteMutation.isPending}
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

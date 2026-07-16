"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { orgSecurityPolicyFormSchema, updateOrgSchema } from "@zerotrust/shared-types/org";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { OrgFeatureFlagsPanel } from "@/components/OrgFeatureFlagsPanel";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { DangerZone } from "@/components/ui/page-patterns";
import { ErrorState } from "@/components/ui/States";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SkeletonCard } from "@/components/ui/skeleton";
import { useToast } from "@/context/ToastContext";
import { useAuthMeQuery } from "@/lib/server-state/auth";
import {
  useDeleteOrganizationMutation,
  useOrganizationDetailQuery,
  useOrganizationMembersQuery,
  useOrganizationSecurityPolicyQuery,
  useSaveOrgSecurityPolicyMutation,
  useTransferOrganizationMutation,
  useUpdateOrganizationMutation,
} from "@/lib/server-state/organizations";
import type { OrgSecurityPolicy } from "@/lib/server-state/types";

type GeneralFormInput = z.input<typeof updateOrgSchema>;
type GeneralFormOutput = z.output<typeof updateOrgSchema>;
type PolicyFormInput = z.input<typeof orgSecurityPolicyFormSchema>;
type PolicyFormOutput = z.output<typeof orgSecurityPolicyFormSchema>;

function policyFormValues(policy: OrgSecurityPolicy): PolicyFormInput {
  return {
    requirePasskeyAttestation: policy.requirePasskeyAttestation,
    requireHardwarePasskey: policy.requireHardwarePasskey,
    allowedPasskeyAaguids: (policy.allowedPasskeyAaguids ?? []).join(", "),
    deniedPasskeyAaguids: (policy.deniedPasskeyAaguids ?? []).join(", "),
    ipAllowlist: (policy.ipAllowlist ?? []).join(", "),
    maxSessionAgeMinutes: Math.round((policy.maxSessionAgeSeconds ?? 0) / 60),
    idleTimeoutMinutes: Math.round((policy.idleTimeoutSeconds ?? 0) / 60),
    maxConcurrentSessions: policy.maxConcurrentSessions ?? 0,
    allowedCountries: (policy.allowedCountries ?? []).join(", "),
  };
}

export default function OrgSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const orgId = params.orgId as string;

  const meQuery = useAuthMeQuery();
  const detailQuery = useOrganizationDetailQuery(orgId);
  const membersQuery = useOrganizationMembersQuery(orgId);
  const policyQuery = useOrganizationSecurityPolicyQuery(orgId);

  const updateMutation = useUpdateOrganizationMutation(orgId);
  const savePolicyMutation = useSaveOrgSecurityPolicyMutation(orgId);
  const transferMutation = useTransferOrganizationMutation(orgId);
  const deleteMutation = useDeleteOrganizationMutation(orgId);

  const org = detailQuery.data?.org ?? null;
  const members = membersQuery.data?.data ?? [];
  const myRole = useMemo(() => {
    const me = members.find((r) => r.user.id === meQuery.data?.id);
    return me?.member.role ?? "";
  }, [members, meQuery.data?.id]);

  const generalForm = useForm<GeneralFormInput, unknown, GeneralFormOutput>({
    resolver: zodResolver(updateOrgSchema),
    mode: "onBlur",
    defaultValues: { name: "", billingEmail: "", logoUrl: "" },
  });
  const policyForm = useForm<PolicyFormInput, unknown, PolicyFormOutput>({
    resolver: zodResolver(orgSecurityPolicyFormSchema),
    mode: "onBlur",
    defaultValues: {
      requirePasskeyAttestation: false,
      requireHardwarePasskey: false,
      allowedPasskeyAaguids: "",
      deniedPasskeyAaguids: "",
      ipAllowlist: "",
      maxSessionAgeMinutes: 0,
      idleTimeoutMinutes: 0,
      maxConcurrentSessions: 0,
      allowedCountries: "",
    },
  });
  const [transferTo, setTransferTo] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const policy = policyQuery.data?.policy ?? null;

  useEffect(() => {
    if (org) {
      generalForm.reset({
        name: org.name,
        billingEmail: org.billingEmail ?? "",
        logoUrl: org.logoUrl ?? "",
      });
    }
  }, [org, generalForm]);

  useEffect(() => {
    if (policyQuery.data?.policy) {
      policyForm.reset(policyFormValues(policyQuery.data.policy));
    }
  }, [policyQuery.data, policyForm]);

  const loading = detailQuery.isPending || membersQuery.isPending || meQuery.isPending;

  if ((detailQuery.error && !detailQuery.data) || (membersQuery.error && !membersQuery.data)) {
    return (
      <ErrorState
        message={
          detailQuery.error?.message ||
          membersQuery.error?.message ||
          "Failed to load organization settings"
        }
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
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!org) {
    return <div className="text-muted-foreground py-8 text-center">Organization not found.</div>;
  }

  if (myRole !== "admin" && myRole !== "owner") {
    return (
      <div className="text-muted-foreground py-8 text-center">
        <p className="font-semibold text-foreground mb-1">Access denied</p>
        <p>You need admin or owner access to view settings.</p>
      </div>
    );
  }

  const nonOwnerMembers = members.filter((m) => m.member.role !== "owner");

  const handleSavePolicy = policyForm.handleSubmit(async (values) => {
    try {
      const res = await savePolicyMutation.mutateAsync(values);
      policyForm.reset(policyFormValues(res.policy));
      toast({ message: "Security policy saved", type: "success" });
    } catch (err: unknown) {
      toast({
        message: err instanceof Error ? err.message : "Failed to save passkey policy",
        type: "error",
      });
    }
  });

  const handleSave = generalForm.handleSubmit(async (values) => {
    try {
      const res = await updateMutation.mutateAsync(values);
      toast({ message: "Settings saved", type: "success" });
      generalForm.reset({
        name: res.org.name,
        billingEmail: res.org.billingEmail ?? "",
        logoUrl: res.org.logoUrl ?? "",
      });
    } catch (err: unknown) {
      toast({
        message: err instanceof Error ? err.message : "Failed to save settings",
        type: "error",
      });
    }
  });

  async function handleTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!transferTo) return;
    if (!confirm("Transfer ownership? You will become an admin.")) return;
    try {
      await transferMutation.mutateAsync({ newOwnerId: transferTo });
      toast({ message: "Ownership transferred", type: "success" });
      router.push(`/dashboard/organizations/${orgId}`);
    } catch (err: unknown) {
      toast({
        message: err instanceof Error ? err.message : "Failed to transfer ownership",
        type: "error",
      });
    }
  }

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!org || deleteConfirm !== org.name) return;
    try {
      await deleteMutation.mutateAsync();
      toast({ message: "Organization deleted", type: "success" });
      router.push("/dashboard/organizations");
    } catch (err: unknown) {
      toast({
        message: err instanceof Error ? err.message : "Failed to delete organization",
        type: "error",
      });
    }
  }

  return (
    <div className="space-y-8 max-w-xl">
      <ServerStateStatus
        isFetching={detailQuery.isFetching || policyQuery.isFetching}
        isStale={detailQuery.isStale || policyQuery.isStale}
        hasData={Boolean(detailQuery.data || policyQuery.data)}
      />

      <div>
        <PageHeader title={<>{org.name} — Settings</>} description={org.slug} />
      </div>

      <form
        onSubmit={handleSave}
        className="bg-card border border-border rounded-xl p-6 space-y-4"
        noValidate
      >
        <h2 className="font-semibold text-foreground">General</h2>
        <div className="space-y-1">
          <label htmlFor="org-name" className="text-xs text-muted-foreground">
            Organization name
          </label>
          <Input
            id="org-name"
            aria-invalid={Boolean(generalForm.formState.errors.name)}
            aria-describedby={generalForm.formState.errors.name ? "org-name-error" : undefined}
            {...generalForm.register("name")}
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring"
          />
          {generalForm.formState.errors.name && (
            <p id="org-name-error" className="text-xs text-destructive" aria-live="polite">
              {generalForm.formState.errors.name.message}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <label htmlFor="org-billing-email" className="text-xs text-muted-foreground">
            Billing email
          </label>
          <Input
            id="org-billing-email"
            type="email"
            placeholder="billing@example.com"
            aria-invalid={Boolean(generalForm.formState.errors.billingEmail)}
            aria-describedby={
              generalForm.formState.errors.billingEmail ? "org-billing-email-error" : undefined
            }
            {...generalForm.register("billingEmail")}
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
          />
          {generalForm.formState.errors.billingEmail && (
            <p id="org-billing-email-error" className="text-xs text-destructive" aria-live="polite">
              {generalForm.formState.errors.billingEmail.message}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <label htmlFor="org-logo-url" className="text-xs text-muted-foreground">
            Logo URL
          </label>
          <Input
            id="org-logo-url"
            type="url"
            placeholder="https://example.com/logo.png"
            aria-invalid={Boolean(generalForm.formState.errors.logoUrl)}
            aria-describedby={
              generalForm.formState.errors.logoUrl ? "org-logo-url-error" : undefined
            }
            {...generalForm.register("logoUrl")}
            className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
          />
          {generalForm.formState.errors.logoUrl && (
            <p id="org-logo-url-error" className="text-xs text-destructive" aria-live="polite">
              {generalForm.formState.errors.logoUrl.message}
            </p>
          )}
        </div>
        <Button
          type="submit"
          disabled={
            !generalForm.formState.isDirty ||
            updateMutation.isPending ||
            generalForm.formState.isSubmitting
          }
          className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm px-4 py-2 rounded-lg transition-colors"
        >
          {updateMutation.isPending ? "Saving…" : "Save changes"}
        </Button>
      </form>

      {policy && (
        <form
          onSubmit={handleSavePolicy}
          className="bg-card border border-border rounded-xl p-6 space-y-4"
          noValidate
        >
          <div>
            <h2 className="font-semibold text-foreground">Security policy</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Passkey requirements (enforced via FIDO MDS3 attestation at registration) and an
              optional IP allowlist for organization access.
            </p>
          </div>

          <label
            htmlFor="require-passkey-attestation"
            className="flex items-start gap-3 cursor-pointer"
          >
            <Input
              id="require-passkey-attestation"
              type="checkbox"
              {...policyForm.register("requirePasskeyAttestation")}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <span className="text-sm text-foreground">
              Require attestation
              <span className="block text-xs text-muted-foreground">
                Reject passkeys that can&apos;t prove their authenticator model (no self/none
                attestation).
              </span>
            </span>
          </label>

          <label
            htmlFor="require-hardware-passkey"
            className="flex items-start gap-3 cursor-pointer"
          >
            <Input
              id="require-hardware-passkey"
              type="checkbox"
              {...policyForm.register("requireHardwarePasskey")}
              className="mt-1 h-4 w-4 accent-primary"
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
            <Input
              id="page-f3"
              {...policyForm.register("allowedPasskeyAaguids")}
              placeholder="ee882879-721c-4913-9775-3dfcce97072a"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="page-f4" className="text-xs text-muted-foreground">
              Denied AAGUIDs
            </label>
            <Input
              id="page-f4"
              {...policyForm.register("deniedPasskeyAaguids")}
              placeholder="00000000-0000-0000-0000-000000000000"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
            />
          </div>

          <div className="border-t border-border pt-4 space-y-1">
            <label htmlFor="page-f5" className="text-xs text-muted-foreground">
              IP allowlist (IPv4 CIDRs, comma or space separated — leave blank to allow all)
            </label>
            <Input
              id="page-f5"
              {...policyForm.register("ipAllowlist")}
              placeholder="203.0.113.0/24, 198.51.100.10"
              className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
            />
            <p className="text-xs text-warning-subtle-foreground">
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
                <Input
                  id="page-f6"
                  type="number"
                  min={0}
                  {...policyForm.register("maxSessionAgeMinutes", { valueAsNumber: true })}
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="page-f7" className="text-xs text-muted-foreground">
                  Idle timeout (minutes)
                </label>
                <Input
                  id="page-f7"
                  type="number"
                  min={0}
                  {...policyForm.register("idleTimeoutMinutes", { valueAsNumber: true })}
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="page-f8" className="text-xs text-muted-foreground">
                  Max concurrent sessions
                </label>
                <Input
                  id="page-f8"
                  type="number"
                  min={0}
                  {...policyForm.register("maxConcurrentSessions", { valueAsNumber: true })}
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:border-ring"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="page-f9" className="text-xs text-muted-foreground">
                Allowed countries (ISO 3166-1 alpha-2, comma or space separated — leave blank to
                allow all)
              </label>
              <Input
                id="page-f9"
                aria-invalid={Boolean(policyForm.formState.errors.allowedCountries)}
                aria-describedby={
                  policyForm.formState.errors.allowedCountries
                    ? "org-allowed-countries-error"
                    : undefined
                }
                {...policyForm.register("allowedCountries")}
                placeholder="US, GB, DE"
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono uppercase text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring"
              />
              {policyForm.formState.errors.allowedCountries && (
                <p
                  id="org-allowed-countries-error"
                  className="text-xs text-destructive"
                  aria-live="polite"
                >
                  {policyForm.formState.errors.allowedCountries.message}
                </p>
              )}
            </div>
          </div>

          <Button
            type="submit"
            disabled={
              !policyForm.formState.isDirty ||
              savePolicyMutation.isPending ||
              policyForm.formState.isSubmitting
            }
            className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {savePolicyMutation.isPending ? "Saving…" : "Save security policy"}
          </Button>
        </form>
      )}

      <OrgFeatureFlagsPanel orgId={orgId} />

      {myRole === "owner" && nonOwnerMembers.length > 0 && (
        <form
          onSubmit={handleTransfer}
          className="bg-card border border-border rounded-xl p-6 space-y-4"
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
          <Button
            type="submit"
            disabled={!transferTo || transferMutation.isPending}
            className="min-h-11 rounded-lg bg-warning-subtle px-4 py-2 text-sm font-medium text-warning-subtle-foreground transition-colors hover:bg-warning-subtle/80 disabled:opacity-50"
          >
            {transferMutation.isPending ? "Transferring…" : "Transfer ownership"}
          </Button>
        </form>
      )}

      {myRole === "owner" && (
        <DangerZone
          title="Delete organization"
          description="This is irreversible. All members and invites will be removed."
        >
          <form onSubmit={handleDelete} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="page-f12" className="text-xs text-muted-foreground">
                Type <span className="font-mono text-foreground">{org.name}</span> to confirm
              </label>
              <Input
                id="page-f12"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder={org.name}
                className="border-border bg-muted focus:border-destructive focus:outline-none"
              />
            </div>
            <Button
              type="submit"
              variant="destructive"
              disabled={deleteConfirm !== org.name || deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete organization"}
            </Button>
          </form>
        </DangerZone>
      )}
    </div>
  );
}

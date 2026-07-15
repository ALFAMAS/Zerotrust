"use client";

import { KeyRound, Plus } from "lucide-react";
import { useState } from "react";
import { ServerStateStatus } from "@/components/ServerStateStatus";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState, SkeletonList } from "@/components/ui/States";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/context/ToastContext";
import { useAdminRolesQuery, useCreateAdminRoleMutation } from "@/lib/server-state/adminRoles";

export default function AdminRolesPage() {
  const { toast } = useToast();
  const rolesQuery = useAdminRolesQuery();
  const createMutation = useCreateAdminRoleMutation();
  const [form, setForm] = useState({ name: "", displayName: "", description: "" });

  const roles = rolesQuery.data?.roles ?? [];

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createMutation.mutateAsync({
        name: form.name.trim(),
        displayName: form.displayName.trim(),
        description: form.description.trim() || undefined,
        permissions: [],
      });
      setForm({ name: "", displayName: "", description: "" });
      toast({ message: "Role created", type: "success" });
    } catch (err) {
      toast({
        message: err instanceof Error ? err.message : "Failed to create role",
        type: "error",
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <KeyRound className="h-6 w-6 text-primary" />
        <div>
          <PageHeader
            title={<>System roles</>}
            description={<>View and create custom RBAC roles. System roles are read-only.</>}
          />
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Roles</CardTitle>
            <CardDescription>{roles.length} roles defined</CardDescription>
          </div>
          <ServerStateStatus query={rolesQuery} />
        </CardHeader>
        <CardContent>
          {rolesQuery.error ? (
            <ErrorState message={rolesQuery.error.message} retry={() => rolesQuery.refetch()} />
          ) : rolesQuery.isPending ? (
            <SkeletonList count={4} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Display name</TableHead>
                  <TableHead>Permissions</TableHead>
                  <TableHead>Type</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roles.map((role) => (
                  <TableRow key={role.id}>
                    <TableCell className="font-mono text-sm">{role.name}</TableCell>
                    <TableCell>{role.displayName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {role.permissions.length} permission
                      {role.permissions.length !== 1 ? "s" : ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant={role.isSystem ? "secondary" : "outline"}>
                        {role.isSystem ? "system" : "custom"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Create role
          </CardTitle>
          <CardDescription>Add a new custom role with an empty permission set.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name (slug)</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="billing_admin"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                placeholder="Billing Admin"
                required
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? "Creating…" : "Create role"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

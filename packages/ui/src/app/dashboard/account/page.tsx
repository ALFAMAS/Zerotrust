"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useCancelAccountDeletionMutation,
  useGdprExportMutation,
  useScheduleAccountDeletionMutation,
} from "@/lib/server-state/account";

export default function AccountPage() {
  const exportMutation = useGdprExportMutation();
  const deleteMutation = useScheduleAccountDeletionMutation();
  const cancelDeletionMutation = useCancelAccountDeletionMutation();

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteStatus, setDeleteStatus] = useState<{
    scheduled?: boolean;
    scheduledFor?: string;
    message?: string;
    error?: string;
  } | null>(null);

  async function handleExport() {
    try {
      const blob = await exportMutation.mutateAsync();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "my-data-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed. Please try again.");
    }
  }

  async function handleDelete() {
    if (deleteConfirm !== "DELETE") return;
    try {
      const data = await deleteMutation.mutateAsync();
      setDeleteStatus({
        scheduled: true,
        scheduledFor: data.scheduledFor,
        message: data.message,
      });
    } catch (err: unknown) {
      setDeleteStatus({
        error: err instanceof Error ? err.message : "Request failed",
      });
    }
  }

  async function handleCancelDeletion() {
    try {
      await cancelDeletionMutation.mutateAsync();
      setDeleteStatus(null);
      setDeleteConfirm("");
    } catch {
      alert("Failed to cancel deletion. Please try again.");
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-10 p-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Account
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your data and account status</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Export your data</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Download a copy of all data associated with your account, including your profile,
            sessions, and activity logs.
          </p>
          <Button onClick={() => void handleExport()} disabled={exportMutation.isPending}>
            {exportMutation.isPending ? "Preparing export…" : "Download my data"}
          </Button>
        </CardContent>
      </Card>

      <Card className="border-red-900/50">
        <CardHeader>
          <CardTitle className="text-red-400">Delete account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {deleteStatus?.scheduled ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-red-950/50 border border-red-800 p-4 text-sm text-red-300">
                <p className="font-medium">Account deletion scheduled</p>
                <p className="mt-1 text-red-400">
                  Your account and all associated data will be permanently deleted on{" "}
                  <span className="font-mono text-red-300">
                    {new Date(deleteStatus.scheduledFor!).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </span>
                  .
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => void handleCancelDeletion()}
                disabled={cancelDeletionMutation.isPending}
              >
                {cancelDeletionMutation.isPending ? "Cancelling…" : "Cancel deletion request"}
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Once you delete your account, all of your data will be permanently removed after a
                30-day grace period. This action cannot be undone.
              </p>

              {deleteStatus?.error && (
                <p className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">
                  {deleteStatus.error}
                </p>
              )}

              <div className="space-y-3">
                <Label htmlFor="account-delete-confirm">
                  Type <span className="font-mono font-bold text-red-400">DELETE</span> to confirm
                </Label>
                <Input
                  id="account-delete-confirm"
                  type="text"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder="DELETE"
                  className="focus-visible:ring-red-500"
                />
                <Button
                  variant="destructive"
                  onClick={() => void handleDelete()}
                  disabled={deleteConfirm !== "DELETE" || deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? "Processing…" : "Delete my account"}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { getToken } from "@/lib/auth";

const API = process.env.NEXT_PUBLIC_ZEROAUTH_URL ?? "http://localhost:3000";

export default function AccountPage() {
  const [exportLoading, setExportLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState<{
    scheduled?: boolean;
    scheduledFor?: string;
    message?: string;
    error?: string;
  } | null>(null);

  async function handleExport() {
    setExportLoading(true);
    try {
      // The GDPR routes are protected by Bearer-token authMiddleware, so we must
      // send the access token. Export streams a file, so we fetch directly (the
      // api client parses JSON) but attach the same Authorization header.
      const token = getToken();
      const res = await fetch(`${API}/gdpr/export`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "my-data-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Export failed. Please try again.");
    } finally {
      setExportLoading(false);
    }
  }

  async function handleDelete() {
    if (deleteConfirm !== "DELETE") return;
    setDeleteLoading(true);
    try {
      const data = await api.delete<{ scheduledFor?: string; message?: string }>("/gdpr/account");
      setDeleteStatus({
        scheduled: true,
        scheduledFor: data.scheduledFor,
        message: data.message,
      });
    } catch (err: unknown) {
      setDeleteStatus({
        error: err instanceof Error ? err.message : "Request failed",
      });
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleCancelDeletion() {
    try {
      await api.post("/gdpr/account/deletion/cancel");
      setDeleteStatus(null);
      setDeleteConfirm("");
    } catch {
      alert("Failed to cancel deletion. Please try again.");
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-10 p-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Account</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage your data and account status</p>
      </div>

      {/* Data Export */}
      <section className="bg-card rounded-xl border border-border p-6 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Export your data</h2>
        <p className="text-sm text-muted-foreground">
          Download a copy of all data associated with your account, including your profile,
          sessions, and activity logs.
        </p>
        <button
          onClick={handleExport}
          disabled={exportLoading}
          className="px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {exportLoading ? "Preparing export…" : "Download my data"}
        </button>
      </section>

      {/* Account Deletion */}
      <section className="bg-card rounded-xl border border-red-900/50 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-red-400">Delete account</h2>

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
            <button
              onClick={handleCancelDeletion}
              className="px-4 py-2 rounded-lg border border-border hover:border-border text-foreground/80 text-sm transition-colors"
            >
              Cancel deletion request
            </button>
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
              <label className="block text-sm text-muted-foreground">
                Type <span className="font-mono font-bold text-red-400">DELETE</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <button
                onClick={handleDelete}
                disabled={deleteConfirm !== "DELETE" || deleteLoading}
                className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-foreground text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {deleteLoading ? "Processing…" : "Delete my account"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

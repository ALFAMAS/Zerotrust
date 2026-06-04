"use client";

import { useState } from "react";

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
      const res = await fetch(`${API}/gdpr/export`, {
        credentials: "include",
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
      const res = await fetch(`${API}/gdpr/account`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteStatus({ error: data.error ?? "Request failed" });
      } else {
        setDeleteStatus({
          scheduled: true,
          scheduledFor: data.scheduledFor,
          message: data.message,
        });
      }
    } catch {
      setDeleteStatus({ error: "Network error. Please try again." });
    } finally {
      setDeleteLoading(false);
    }
  }

  async function handleCancelDeletion() {
    try {
      const res = await fetch(`${API}/gdpr/account/deletion/cancel`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setDeleteStatus(null);
        setDeleteConfirm("");
      }
    } catch {
      alert("Failed to cancel deletion. Please try again.");
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-10 p-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Account</h1>
        <p className="mt-1 text-sm text-gray-400">Manage your data and account status</p>
      </div>

      {/* Data Export */}
      <section className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-white">Export your data</h2>
        <p className="text-sm text-gray-400">
          Download a copy of all data associated with your account, including your profile,
          sessions, and activity logs.
        </p>
        <button
          onClick={handleExport}
          disabled={exportLoading}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {exportLoading ? "Preparing export…" : "Download my data"}
        </button>
      </section>

      {/* Account Deletion */}
      <section className="bg-gray-900 rounded-xl border border-red-900/50 p-6 space-y-4">
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
              className="px-4 py-2 rounded-lg border border-gray-700 hover:border-gray-500 text-gray-300 text-sm transition-colors"
            >
              Cancel deletion request
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-400">
              Once you delete your account, all of your data will be permanently removed after a
              30-day grace period. This action cannot be undone.
            </p>

            {deleteStatus?.error && (
              <p className="text-sm text-red-400 bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">
                {deleteStatus.error}
              </p>
            )}

            <div className="space-y-3">
              <label className="block text-sm text-gray-400">
                Type <span className="font-mono font-bold text-red-400">DELETE</span> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="DELETE"
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500"
              />
              <button
                onClick={handleDelete}
                disabled={deleteConfirm !== "DELETE" || deleteLoading}
                className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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

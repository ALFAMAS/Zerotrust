"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "../../../lib/api";
import { brand } from "@/config/brand";

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [form, setForm] = useState({ displayName: "", avatarUrl: "", phone: "", username: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error">("success");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .get<any>("/auth/me")
      .then((u) => {
        setUser(u);
        setForm({
          displayName: u.displayName || "",
          avatarUrl: u.avatarUrl || "",
          phone: u.phone || "",
          username: u.username || "",
        });
      })
      .catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      const updated = await api.patch<any>("/auth/me", {
        displayName: form.displayName || undefined,
        avatarUrl: form.avatarUrl || null,
        phone: form.phone || null,
        username: form.username || null,
      });
      setUser({ ...user, ...updated });
      setMsg("Profile updated successfully.");
      setMsgType("success");
    } catch (err: any) {
      setMsg(err.message || "Update failed");
      setMsgType("error");
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMsg("");
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("za_token") : null;
      const fd = new FormData();
      fd.append("avatar", file);

      const res = await fetch(`${brand.apiUrl}/auth/me/avatar`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: res.statusText }));
        throw new Error(err.message || `Upload failed (${res.status})`);
      }

      const { avatarUrl } = await res.json();
      setForm((f) => ({ ...f, avatarUrl }));
      setUser((u: any) => ({ ...u, avatarUrl }));
      setMsg("Avatar updated.");
      setMsgType("success");
    } catch (err: any) {
      setMsg(err.message || "Upload failed");
      setMsgType("error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const initials = user?.displayName
    ? user.displayName
        .split(" ")
        .map((w: string) => w[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-white mb-6">Profile Settings</h1>

      {/* Avatar */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="font-semibold text-white mb-4">Avatar</h2>
        <div className="flex items-center gap-5">
          <div className="relative flex-shrink-0">
            {form.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={form.avatarUrl}
                alt="Avatar"
                className="w-20 h-20 rounded-full object-cover border-2 border-gray-700"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-indigo-600 flex items-center justify-center text-white text-2xl font-bold border-2 border-gray-700">
                {initials}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-400 mb-3">
              Upload a JPEG, PNG, GIF, or WebP image (max 5 MB).
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={handleAvatarUpload}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="px-4 py-2 text-sm border border-gray-600 hover:border-gray-400 text-gray-300 hover:text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {uploading ? "Uploading…" : "Choose file"}
            </button>
          </div>
        </div>
      </div>

      {/* Personal info */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="font-semibold text-white mb-4">Personal Info</h2>
        {msg && (
          <div
            className={`mb-4 p-3 rounded-lg text-sm border ${
              msgType === "success"
                ? "bg-emerald-950 border-emerald-800 text-emerald-300"
                : "bg-red-950 border-red-800 text-red-300"
            }`}
          >
            {msg}
          </div>
        )}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Display Name</label>
            <input
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Username</label>
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="lowercase, hyphens, underscores"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Email</label>
            <input
              value={user?.email || ""}
              disabled
              className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2.5 text-gray-500 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Phone</label>
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+1 555 000 0000"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </form>
      </div>

      <div className="bg-gray-900 border border-red-900/50 rounded-xl p-6">
        <h2 className="font-semibold text-red-400 mb-2">Danger Zone</h2>
        <p className="text-sm text-gray-400 mb-4">
          Permanently delete your account. This cannot be undone.
        </p>
        <button
          onClick={() =>
            confirm("Are you absolutely sure?") &&
            alert("Contact an administrator to delete your account.")
          }
          className="px-4 py-2 border border-red-700 text-red-400 hover:bg-red-900/30 text-sm rounded-lg transition-colors"
        >
          Delete Account
        </button>
      </div>
    </div>
  );
}

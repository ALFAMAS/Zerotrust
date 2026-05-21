"use client";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);
  const [form, setForm] = useState({ displayName: "", avatarUrl: "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.get<any>("/auth/me").then((u) => { setUser(u); setForm({ displayName: u.displayName || "", avatarUrl: u.avatarUrl || "" }); }).catch(() => {});
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg("");
    try {
      await api.patch("/auth/me", form);
      setMsg("Profile updated successfully.");
    } catch (err: any) {
      setMsg(err.message || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-white mb-6">Profile Settings</h1>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="font-semibold text-white mb-4">Personal Info</h2>
        {msg && <div className="mb-4 p-3 bg-indigo-950 border border-indigo-800 text-indigo-300 rounded-lg text-sm">{msg}</div>}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Display Name</label>
            <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Email</label>
            <input value={user?.email || ""} disabled
              className="w-full bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2.5 text-gray-500 cursor-not-allowed" />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1.5">Avatar URL</label>
            <input value={form.avatarUrl} onChange={(e) => setForm({ ...form, avatarUrl: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              placeholder="https://..." />
          </div>
          <button type="submit" disabled={saving} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </form>
      </div>

      <div className="bg-gray-900 border border-red-900/50 rounded-xl p-6">
        <h2 className="font-semibold text-red-400 mb-2">Danger Zone</h2>
        <p className="text-sm text-gray-400 mb-4">Permanently delete your account. This cannot be undone.</p>
        <button
          onClick={() => confirm("Are you absolutely sure?") && alert("Contact an administrator to delete your account.")}
          className="px-4 py-2 border border-red-700 text-red-400 hover:bg-red-900/30 text-sm rounded-lg transition-colors"
        >
          Delete Account
        </button>
      </div>
    </div>
  );
}

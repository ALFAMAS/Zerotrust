"use client";
import { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "../../../lib/api";

function ResetForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match"); return; }
    setLoading(true);
    try {
      await api.post("/auth/password-reset/reset", { token, newPassword: password }, true);
      setDone(true);
    } catch (err: any) {
      setError(err.message || "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="text-center py-4">
        <div className="text-4xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-white mb-2">Password updated</h2>
        <p className="text-gray-400 text-sm mb-6">Your password has been changed. You can now sign in.</p>
        <Link href="/login" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg text-sm transition-colors">
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-white mb-1">New password</h1>
      <p className="text-gray-400 text-sm mb-6">Choose a strong password for your account.</p>
      {error && <div className="mb-4 p-3 bg-red-950 border border-red-800 text-red-300 rounded-lg text-sm">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">New Password</label>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} minLength={8}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
            placeholder="At least 8 characters"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Confirm Password</label>
          <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
            placeholder="Repeat password"
          />
        </div>
        <button type="submit" disabled={loading} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors">
          {loading ? "Updating…" : "Update Password"}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<div className="text-gray-400">Loading...</div>}><ResetForm /></Suspense>;
}

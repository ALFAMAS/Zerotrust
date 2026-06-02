"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";

export default function MagicLinkPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/magic-link/send", { email, redirectUrl: "/dashboard" }, true);
      setSent(true);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="text-center py-4">
        <div className="text-4xl mb-4">📬</div>
        <h2 className="text-xl font-bold text-white mb-2">Check your inbox</h2>
        <p className="text-gray-400 text-sm mb-6">
          We sent a sign-in link to <strong className="text-white">{email}</strong>.
          The link expires in 15 minutes.
        </p>
        <button onClick={() => setSent(false)} className="text-indigo-400 hover:text-indigo-300 text-sm">
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="text-center mb-6">
        <div className="text-3xl mb-3">✉️</div>
        <h1 className="text-2xl font-bold text-white mb-1">Magic link login</h1>
        <p className="text-gray-400 text-sm">Get a secure one-click sign-in link via email. No password needed.</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-950 border border-red-800 text-red-300 rounded-lg text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Email</label>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
            placeholder="you@example.com"
          />
        </div>
        <button
          type="submit" disabled={loading}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
        >
          {loading ? "Sending…" : "Send Magic Link"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        <Link href="/login" className="text-indigo-400 hover:text-indigo-300">← Back to sign in</Link>
      </p>
    </>
  );
}

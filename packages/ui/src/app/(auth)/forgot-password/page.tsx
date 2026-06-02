"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await api.post("/auth/password-reset/request", { email }, true).catch(() => {});
    setSent(true);
    setLoading(false);
  };

  if (sent) {
    return (
      <div className="text-center py-4">
        <div className="text-4xl mb-4">📬</div>
        <h2 className="text-xl font-bold text-white mb-2">Check your email</h2>
        <p className="text-gray-400 text-sm mb-6">If an account with that email exists, a password reset link has been sent.</p>
        <Link href="/login" className="text-indigo-400 hover:text-indigo-300 text-sm">← Back to login</Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold text-white mb-1">Reset password</h1>
      <p className="text-gray-400 text-sm mb-6">We'll send a reset link to your email.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Email</label>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
            placeholder="you@example.com"
          />
        </div>
        <button type="submit" disabled={loading} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors">
          {loading ? "Sending…" : "Send Reset Link"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-gray-500">
        <Link href="/login" className="text-indigo-400 hover:text-indigo-300">← Back to login</Link>
      </p>
    </>
  );
}

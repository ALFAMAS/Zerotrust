"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { setToken } from "../../../lib/auth";
import { useToast } from "@/lib/toast";
import { brand } from "@/config/brand";

function passwordStrength(p: string): { score: number; label: string; color: string } {
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[A-Z]/.test(p)) score++;
  if (/[0-9]/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  const levels = [
    { label: "Weak", color: "bg-red-500" },
    { label: "Weak", color: "bg-red-500" },
    { label: "Fair", color: "bg-yellow-500" },
    { label: "Good", color: "bg-blue-500" },
    { label: "Strong", color: "bg-emerald-500" },
    { label: "Very Strong", color: "bg-emerald-400" },
  ];
  return { score, ...levels[score] };
}

export default function RegisterPage() {
  const [form, setForm] = useState({ displayName: "", email: "", password: "", confirm: "" });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const strength = passwordStrength(form.password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      toast({ message: "Passwords do not match", type: "error" });
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/register", {
        email: form.email,
        password: form.password,
        displayName: form.displayName,
      }, true);
      const data = await api.post<any>("/auth/login", { email: form.email, password: form.password }, true);
      setToken(data.accessToken, data.refreshToken);
      toast({ message: "Account created! Welcome aboard.", type: "success" });
      window.location.href = "/dashboard";
    } catch (err: any) {
      toast({ message: err.message || "Registration failed", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <h1 className="text-2xl font-bold text-white mb-1">Create account</h1>
      <p className="text-gray-400 text-sm mb-6">Start with {brand.name} for free</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Display Name</label>
          <input
            type="text" required value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
            placeholder="Your Name"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Email</label>
          <input
            type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Password</label>
          <input
            type="password" required autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors"
            placeholder="At least 8 characters"
          />
          {form.password && (
            <div className="mt-2">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className={`h-1 flex-1 rounded-full ${i <= strength.score ? strength.color : "bg-gray-700"}`} />
                ))}
              </div>
              <span className="text-xs text-gray-400 mt-1 block">{strength.label}</span>
            </div>
          )}
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1.5">Confirm Password</label>
          <input
            type="password" required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            className={`w-full bg-gray-800 border rounded-lg px-3 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors ${form.confirm && form.confirm !== form.password ? "border-red-600" : "border-gray-700"}`}
            placeholder="Repeat password"
          />
        </div>

        <button
          type="submit" disabled={loading}
          className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors mt-2"
        >
          {loading ? "Creating account…" : "Create Account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Already have an account?{" "}
        <Link href="/login" className="text-indigo-400 hover:text-indigo-300 font-medium">Sign in</Link>
      </p>
    </>
  );
}

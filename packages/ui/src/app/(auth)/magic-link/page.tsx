"use client";
import Link from "next/link";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      <div className="py-4 text-center">
        <div className="mb-4 text-4xl">📬</div>
        <h2 className="mb-2 text-xl font-bold text-foreground">Check your inbox</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          We sent a sign-in link to <strong className="text-foreground">{email}</strong>. The link
          expires in 15 minutes.
        </p>
        <Button variant="link" onClick={(): any => setSent(false)} className="text-sm">
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 text-center">
        <div className="mb-3 text-3xl">✉️</div>
        <h1 className="mb-1 text-2xl font-bold text-foreground">Magic link login</h1>
        <p className="text-sm text-muted-foreground">
          Get a secure one-click sign-in link via email. No password needed.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Sending…" : "Send Magic Link"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-primary hover:text-primary/80">
          ← Back to sign in
        </Link>
      </p>
    </>
  );
}

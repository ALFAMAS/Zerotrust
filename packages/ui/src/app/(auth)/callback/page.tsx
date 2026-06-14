"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setToken } from "@/lib/auth";

function Spinner({ label }: { label: string }) {
  return (
    <div className="py-8 text-center">
      <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const accessToken = params.get("accessToken");
    const refreshToken = params.get("refreshToken");
    if (accessToken && refreshToken) {
      setToken(accessToken, refreshToken);
    }
    router.replace("/dashboard");
  }, [params, router]);

  return <Spinner label="Signing you in…" />;
}

export default function CallbackPage() {
  return (
    <Suspense fallback={<Spinner label="Loading…" />}>
      <CallbackInner />
    </Suspense>
  );
}

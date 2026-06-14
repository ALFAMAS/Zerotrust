"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../../lib/api";
import { getToken } from "../../../lib/auth";
import { SkeletonCard } from "@/components/Skeleton";

interface AcceptResult {
  org: {
    id: string;
    name: string;
    slug: string;
  } | null;
  member: {
    role: string;
  };
}

export default function InviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [result, setResult] = useState<AcceptResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    // If not logged in, redirect to login page preserving the invite URL
    const authToken = getToken();
    if (!authToken) {
      router.replace(`/login?next=/invite/${token}`);
      return;
    }

    api
      .post<AcceptResult>("/orgs/invites/accept", { token })
      .then((res) => {
        setResult(res);
        setStatus("success");
      })
      .catch((err: any) => {
        setErrorMessage(err.message || "Failed to accept invite");
        setStatus("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <SkeletonCard className="h-40" />
          <p className="text-center text-muted-foreground text-sm mt-4">Accepting invitation…</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-card border border-red-900 rounded-xl p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-900 flex items-center justify-center mx-auto text-red-300 text-xl font-bold">
            !
          </div>
          <h1 className="text-lg font-semibold text-foreground">Invite error</h1>
          <p className="text-sm text-muted-foreground">{errorMessage}</p>
          <Link
            href="/dashboard/organizations"
            className="inline-block text-sm text-primary hover:text-primary/80 underline"
          >
            Go to Organizations
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-card border border-green-900 rounded-xl p-6 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-green-900 flex items-center justify-center mx-auto text-green-300 text-xl font-bold">
          ✓
        </div>
        <h1 className="text-lg font-semibold text-foreground">
          You&apos;ve joined {result?.org?.name ?? "the organization"}!
        </h1>
        <p className="text-sm text-muted-foreground capitalize">
          Your role: <span className="font-medium text-foreground">{result?.member?.role}</span>
        </p>
        {result?.org && (
          <Link
            href={`/dashboard/organizations/${result.org.id}`}
            className="inline-block text-sm bg-primary hover:bg-primary/90 text-foreground px-4 py-2 rounded-lg transition-colors"
          >
            Go to {result.org.name}
          </Link>
        )}
        <div>
          <Link
            href="/dashboard/organizations"
            className="text-xs text-muted-foreground hover:text-muted-foreground underline"
          >
            All organizations
          </Link>
        </div>
      </div>
    </div>
  );
}

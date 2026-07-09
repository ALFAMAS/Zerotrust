"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/States";
import { useAcceptInviteMutation } from "@/lib/server-state/organizations";
import { getToken } from "../../../lib/auth";

export default function InviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const acceptMutation = useAcceptInviteMutation();
  const started = useRef(false);

  useEffect(() => {
    const authToken = getToken();
    if (!authToken) {
      router.replace(`/login?next=/invite/${encodeURIComponent(token)}`);
      return;
    }
    if (started.current) return;
    started.current = true;
    acceptMutation.mutate({ token });
  }, [token, router, acceptMutation]);

  if (acceptMutation.isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm space-y-4 text-center">
          <LoadingSpinner />
          <p className="text-sm text-muted-foreground">Accepting invitation…</p>
        </div>
      </div>
    );
  }

  if (acceptMutation.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm border-destructive/40 text-center">
          <CardHeader className="items-center space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="h-6 w-6" aria-hidden />
            </div>
            <h2 className="font-semibold leading-none tracking-tight">Invite error</h2>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {acceptMutation.error?.message || "Failed to accept invite"}
            </p>
          </CardContent>
          <CardFooter className="justify-center">
            <Button variant="link" asChild>
              <Link href="/dashboard/organizations">Go to Organizations</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const result = acceptMutation.data;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm border-emerald-900/40 text-center">
        <CardHeader className="items-center space-y-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
            <CheckCircle2 className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="font-semibold leading-none tracking-tight">
            You&apos;ve joined {result?.org?.name ?? "the organization"}!
          </h1>
        </CardHeader>
        <CardContent>
          <p className="text-sm capitalize text-muted-foreground">
            Your role: <span className="font-medium text-foreground">{result?.member?.role}</span>
          </p>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          {result?.org && (
            <Button asChild className="w-full">
              <Link href={`/dashboard/organizations/${result.org.id}`}>
                Go to {result.org.name}
              </Link>
            </Button>
          )}
          <Button variant="link" size="sm" asChild>
            <Link href="/dashboard/organizations">All organizations</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

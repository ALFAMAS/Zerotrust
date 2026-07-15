"use client";

import { AlertCircle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/ui/States";
import { useAcceptInviteMutation } from "@/lib/server-state/organizations";
import { getToken } from "../../../lib/auth";

function InviteShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main id="main-content" className="flex w-full flex-1 items-center justify-center px-4 py-8">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

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
      <InviteShell>
        <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8 text-center">
          <LoadingSpinner />
          <h1 className="mt-4 font-display text-xl font-semibold">Accepting invitation</h1>
          <p className="mt-2 text-sm text-muted-foreground">This should only take a moment.</p>
        </div>
      </InviteShell>
    );
  }

  if (acceptMutation.isError) {
    return (
      <InviteShell>
        <Card className="w-full max-w-sm border-destructive/40 text-center">
          <CardHeader className="items-center space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="h-6 w-6" aria-hidden />
            </div>
            <h1 className="font-display text-xl font-semibold leading-tight tracking-tight">
              Invite error
            </h1>
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
      </InviteShell>
    );
  }

  const result = acceptMutation.data;

  return (
    <InviteShell>
      <Card className="w-full max-w-sm border-success text-center">
        <CardHeader className="items-center space-y-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success-subtle-foreground">
            <CheckCircle2 className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="font-display text-xl font-semibold leading-tight tracking-tight">
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
    </InviteShell>
  );
}

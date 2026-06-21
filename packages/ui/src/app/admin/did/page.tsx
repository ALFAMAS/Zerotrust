"use client";

import { Fingerprint, Globe, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api";

interface VerificationMethod {
  id: string;
  type: string;
  controller: string;
  publicKeyMultibase?: string;
  publicKeyJwk?: Record<string, unknown>;
}

interface DIDDocument {
  "@context": string | string[];
  id: string;
  verificationMethod?: VerificationMethod[];
  authentication?: (string | VerificationMethod)[];
  assertionMethod?: (string | VerificationMethod)[];
  service?: { id: string; type: string; serviceEndpoint: string }[];
}

interface ResolveResponse {
  did: string;
  didDocument: DIDDocument;
}

interface ChallengeResponse {
  challengeId: string;
  challenge: string;
  domain: string;
  expiresAt: string;
}

const EXAMPLE_KEY = "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK";

export default function AdminDIDPage() {
  // Resolver state
  const [resolveDid, setResolveDid] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<ResolveResponse | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  // Challenge state
  const [challengeDid, setChallengeDid] = useState("");
  const [challenging, setChallenging] = useState(false);
  const [challenge, setChallenge] = useState<ChallengeResponse | null>(null);
  const [challengeError, setChallengeError] = useState<string | null>(null);

  async function handleResolve(did?: string) {
    const target = (did ?? resolveDid).trim();
    if (!target) return;
    setResolving(true);
    setResolveError(null);
    setResolved(null);
    try {
      const data = await api.get<ResolveResponse>(
        `/auth/did/resolve?did=${encodeURIComponent(target)}`
      );
      setResolved(data);
    } catch (err: unknown) {
      setResolveError(err instanceof Error ? err.message : "Could not resolve this DID");
    } finally {
      setResolving(false);
    }
  }

  async function handleChallenge() {
    const target = challengeDid.trim();
    if (!target) return;
    setChallenging(true);
    setChallengeError(null);
    setChallenge(null);
    try {
      const data = await api.post<ChallengeResponse>("/auth/did/challenge", {
        did: target,
      });
      setChallenge(data);
    } catch (err: unknown) {
      setChallengeError(err instanceof Error ? err.message : "Could not create a challenge");
    } finally {
      setChallenging(false);
    }
  }

  const authMethods = resolved?.didDocument.authentication?.length ?? 0;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Decentralized Identity (DID)
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Resolve <code className="rounded bg-muted px-1 py-0.5 text-xs">did:key</code> and{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">did:web</code> identifiers, and
          generate a proof-of-control challenge. Use this to verify an organization&apos;s{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">did:web</code> before trusting it,
          or to test a DID authentication integration.
        </p>
      </div>

      {/* Resolver */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-1 flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-foreground">Resolve a DID</h2>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Fetches the DID document — its verification methods and authentication keys.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={resolveDid}
            onChange={(e) => setResolveDid(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleResolve()}
            placeholder="did:web:example.com  or  did:key:z6Mk…"
            className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
          />
          <button
            onClick={() => handleResolve()}
            disabled={resolving || !resolveDid.trim()}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {resolving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Fingerprint className="h-4 w-4" />
            )}
            Resolve
          </button>
        </div>

        <button
          onClick={() => {
            setResolveDid(EXAMPLE_KEY);
            handleResolve(EXAMPLE_KEY);
          }}
          className="mt-2 text-xs text-primary hover:text-primary/80"
        >
          Try an example did:key
        </button>

        {resolveError && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {resolveError}
          </div>
        )}

        {resolved && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-400">
                <ShieldCheck className="h-3.5 w-3.5" /> Resolved
              </span>
              <span className="text-xs text-muted-foreground">
                {authMethods} authentication method{authMethods === 1 ? "" : "s"}
              </span>
            </div>

            {resolved.didDocument.verificationMethod?.map((vm) => (
              <div key={vm.id} className="rounded-lg border border-border bg-background p-3">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 shrink-0 text-primary" />
                  <span className="text-sm font-medium text-foreground">{vm.type}</span>
                </div>
                <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{vm.id}</p>
              </div>
            ))}

            <details className="rounded-lg border border-border bg-background p-3">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                Raw DID document
              </summary>
              <pre className="mt-2 overflow-x-auto rounded bg-muted p-3 text-xs text-foreground">
                {JSON.stringify(resolved.didDocument, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </section>

      {/* Challenge */}
      <section className="rounded-xl border border-border bg-card p-5">
        <div className="mb-1 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-foreground">Generate a proof-of-control challenge</h2>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          The DID holder signs the returned challenge with the key in their document&apos;s{" "}
          <code className="rounded bg-muted px-1 py-0.5">authentication</code> set, then POSTs the
          signed proof to <code className="rounded bg-muted px-1 py-0.5">/auth/did/verify</code>.
        </p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={challengeDid}
            onChange={(e) => setChallengeDid(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleChallenge()}
            placeholder="did:web:example.com"
            className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
          />
          <button
            onClick={handleChallenge}
            disabled={challenging || !challengeDid.trim()}
            className="flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {challenging ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            Create challenge
          </button>
        </div>

        {challengeError && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {challengeError}
          </div>
        )}

        {challenge && (
          <dl className="mt-4 space-y-2 rounded-lg border border-border bg-background p-4 text-sm">
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">Challenge ID</dt>
              <dd className="break-all font-mono text-xs text-foreground">
                {challenge.challengeId}
              </dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">Challenge (sign this)</dt>
              <dd className="break-all font-mono text-xs text-foreground">{challenge.challenge}</dd>
            </div>
            <div className="flex gap-6">
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Domain</dt>
                <dd className="font-mono text-xs text-foreground">{challenge.domain}</dd>
              </div>
              <div className="flex flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">Expires</dt>
                <dd className="text-xs text-foreground">
                  {new Date(challenge.expiresAt).toLocaleString()}
                </dd>
              </div>
            </div>
          </dl>
        )}
      </section>
    </div>
  );
}

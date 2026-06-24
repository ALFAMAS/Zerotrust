"use client";

import { Check, Loader2, Settings, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../../../../lib/api";

interface SsoConfig {
  saml?: {
    enabled: boolean;
    idpEntityId?: string;
    idpSsoUrl?: string;
    idpCert?: string;
    lastTestedAt?: string;
    lastTestStatus?: "success" | "error";
    lastTestError?: string;
  };
  oidc?: {
    enabled: boolean;
    issuerUrl?: string;
    clientId?: string;
    clientSecret?: string;
    redirectUris?: string[];
    lastTestedAt?: string;
    lastTestStatus?: "success" | "error";
    lastTestError?: string;
  };
}

export function SsoSettingsForm({
  orgId,
  myRole,
  toast,
}: {
  orgId: string;
  myRole: string;
  toast: (opts: { message: string; type: "success" | "error" }) => void;
}) {
  const [sso, setSso] = useState<SsoConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<any>(null);

  // SAML form state
  const [samlEnabled, setSamlEnabled] = useState(false);
  const [samlEntityId, setSamlEntityId] = useState("");
  const [samlSsoUrl, setSamlSsoUrl] = useState("");
  const [samlCert, setSamlCert] = useState("");

  // OIDC form state
  const [oidcEnabled, setOidcEnabled] = useState(false);
  const [oidcIssuer, setOidcIssuer] = useState("");
  const [oidcClientId, setOidcClientId] = useState("");
  const [oidcClientSecret, setOidcClientSecret] = useState("");
  const [oidcRedirectUris, setOidcRedirectUris] = useState("");

  useEffect(() => {
    api
      .get<{ sso: SsoConfig }>(`/orgs/${orgId}/sso`)
      .then((res) => {
        const cfg = res.sso ?? {};
        setSso(cfg);
        setSamlEnabled(cfg.saml?.enabled ?? false);
        setSamlEntityId(cfg.saml?.idpEntityId ?? "");
        setSamlSsoUrl(cfg.saml?.idpSsoUrl ?? "");
        setSamlCert(cfg.saml?.idpCert ?? "");
        setOidcEnabled(cfg.oidc?.enabled ?? false);
        setOidcIssuer(cfg.oidc?.issuerUrl ?? "");
        setOidcClientId(cfg.oidc?.clientId ?? "");
        setOidcClientSecret(cfg.oidc?.clientSecret ?? "");
        setOidcRedirectUris((cfg.oidc?.redirectUris ?? []).join("\n"));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setTestResults(null);
    try {
      const res = await api.put<{ sso: SsoConfig }>(`/orgs/${orgId}/sso`, {
        saml: samlEnabled
          ? {
              enabled: true,
              idpEntityId: samlEntityId || undefined,
              idpSsoUrl: samlSsoUrl || undefined,
              idpCert: samlCert || undefined,
            }
          : undefined,
        oidc: oidcEnabled
          ? {
              enabled: true,
              issuerUrl: oidcIssuer || undefined,
              clientId: oidcClientId || undefined,
              clientSecret: oidcClientSecret || undefined,
              redirectUris: oidcRedirectUris
                .split("\n")
                .map((u) => u.trim())
                .filter(Boolean),
            }
          : undefined,
      });
      setSso(res.sso);
      toast({ message: "SSO configuration saved", type: "success" });
    } catch (err: any) {
      toast({ message: err.message || "Failed to save SSO config", type: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResults(null);
    try {
      const res = await api.post<{ results: unknown }>(`/orgs/${orgId}/sso/test`, {});
      setTestResults(res.results);
      toast({ message: "Connection test complete", type: "success" });
    } catch (err: any) {
      toast({ message: err.message || "Test failed", type: "error" });
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading SSO configuration…</span>
        </div>
      </div>
    );
  }

  const canEdit = myRole === "admin" || myRole === "owner";

  return (
    <form onSubmit={handleSave} className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-foreground">Single Sign-On (SSO)</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || (!samlEnabled && !oidcEnabled)}
            className="bg-muted hover:bg-muted/70 border border-border text-foreground text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {testing ? (
              <>
                <Loader2 className="inline h-3 w-3 animate-spin mr-1" />
                Testing…
              </>
            ) : (
              "Test connection"
            )}
          </button>
          {canEdit && (
            <button
              type="submit"
              disabled={saving}
              className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm px-4 py-2 rounded-lg transition-colors"
            >
              {saving ? "Saving…" : "Save SSO config"}
            </button>
          )}
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Configure SAML 2.0 or OpenID Connect for your organization. Users will be able to sign in
        through your identity provider.
      </p>

      {/* Test results */}
      {testResults && (
        <div className="space-y-2">
          {testResults.saml && (
            <div
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                testResults.saml.status === "success"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-red-500/10 text-red-400"
              }`}
            >
              {testResults.saml.status === "success" ? (
                <Check className="h-4 w-4" />
              ) : (
                <X className="h-4 w-4" />
              )}
              SAML: {testResults.saml.status === "success" ? "Connection successful" : testResults.saml.error}
            </div>
          )}
          {testResults.oidc && (
            <div
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                testResults.oidc.status === "success"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "bg-red-500/10 text-red-400"
              }`}
            >
              {testResults.oidc.status === "success" ? (
                <Check className="h-4 w-4" />
              ) : (
                <X className="h-4 w-4" />
              )}
              OIDC: {testResults.oidc.status === "success" ? "Connection successful" : testResults.oidc.error}
            </div>
          )}
        </div>
      )}

      {/* SAML section */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={samlEnabled}
            onChange={(e) => setSamlEnabled(e.target.checked)}
            disabled={!canEdit}
            className="h-4 w-4 accent-primary"
          />
          <span className="text-sm font-medium text-foreground">SAML 2.0</span>
          {sso?.saml?.lastTestStatus && (
            <span
              className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                sso.saml.lastTestStatus === "success"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-red-500/15 text-red-400"
              }`}
            >
              {sso.saml.lastTestStatus}
            </span>
          )}
        </label>

        {samlEnabled && (
          <div className="space-y-3 pl-7">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">IdP Entity ID</label>
              <input
                value={samlEntityId}
                onChange={(e) => setSamlEntityId(e.target.value)}
                placeholder="https://idp.example.com/metadata"
                disabled={!canEdit}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring disabled:opacity-50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">IdP SSO URL</label>
              <input
                value={samlSsoUrl}
                onChange={(e) => setSamlSsoUrl(e.target.value)}
                placeholder="https://idp.example.com/sso"
                disabled={!canEdit}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring disabled:opacity-50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">IdP Certificate (PEM)</label>
              <textarea
                value={samlCert}
                onChange={(e) => setSamlCert(e.target.value)}
                placeholder="-----BEGIN CERTIFICATE-----&#10;…&#10;-----END CERTIFICATE-----"
                rows={4}
                disabled={!canEdit}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring disabled:opacity-50"
              />
            </div>
          </div>
        )}
      </div>

      {/* OIDC section */}
      <div className="border border-border rounded-lg p-4 space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={oidcEnabled}
            onChange={(e) => setOidcEnabled(e.target.checked)}
            disabled={!canEdit}
            className="h-4 w-4 accent-primary"
          />
          <span className="text-sm font-medium text-foreground">OpenID Connect</span>
          {sso?.oidc?.lastTestStatus && (
            <span
              className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                sso.oidc.lastTestStatus === "success"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-red-500/15 text-red-400"
              }`}
            >
              {sso.oidc.lastTestStatus}
            </span>
          )}
        </label>

        {oidcEnabled && (
          <div className="space-y-3 pl-7">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Issuer URL</label>
              <input
                value={oidcIssuer}
                onChange={(e) => setOidcIssuer(e.target.value)}
                placeholder="https://accounts.example.com"
                disabled={!canEdit}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring disabled:opacity-50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Client ID</label>
              <input
                value={oidcClientId}
                onChange={(e) => setOidcClientId(e.target.value)}
                disabled={!canEdit}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring disabled:opacity-50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Client Secret</label>
              <input
                type="password"
                value={oidcClientSecret}
                onChange={(e) => setOidcClientSecret(e.target.value)}
                placeholder="••••••••"
                disabled={!canEdit}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring disabled:opacity-50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Redirect URIs (one per line)</label>
              <textarea
                value={oidcRedirectUris}
                onChange={(e) => setOidcRedirectUris(e.target.value)}
                placeholder="https://yourapp.com/auth/callback"
                rows={3}
                disabled={!canEdit}
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-ring disabled:opacity-50"
              />
            </div>
          </div>
        )}
      </div>
    </form>
  );
}

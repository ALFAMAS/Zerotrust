"use client";
import { useEffect, useState } from "react";
import { api } from "../../../lib/api";

export default function SecurityPage() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [totpSetup, setTotpSetup] = useState<any>(null);
  const [totpCode, setTotpCode] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.get<any>("/auth/me").then(setUser).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const startTOTP = async () => {
    const data = await api.post<any>("/auth/mfa/totp/setup").catch(() => null);
    if (data) setTotpSetup(data);
  };

  const verifyTOTP = async () => {
    try {
      await api.post("/auth/mfa/totp/verify", { code: totpCode });
      setMsg("TOTP enabled successfully!");
      setTotpSetup(null);
      setTotpCode("");
      const u = await api.get<any>("/auth/me");
      setUser(u);
    } catch (err: any) {
      setMsg(err.message || "TOTP verification failed");
    }
  };

  if (loading) return <p className="text-gray-400">Loading…</p>;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-white">Security Settings</h1>

      {msg && <div className="p-3 bg-indigo-950 border border-indigo-800 text-indigo-300 rounded-lg text-sm">{msg}</div>}

      {/* TOTP */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-white">Authenticator App (TOTP)</h2>
            <p className="text-sm text-gray-400 mt-0.5">Use an app like Google Authenticator or 1Password.</p>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full ${user?.mfa?.totp?.enabled ? "bg-emerald-900 text-emerald-300" : "bg-gray-800 text-gray-400"}`}>
            {user?.mfa?.totp?.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>

        {!user?.mfa?.totp?.enabled && !totpSetup && (
          <button onClick={startTOTP} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
            Set Up TOTP
          </button>
        )}

        {totpSetup && (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-gray-400">Scan this QR code with your authenticator app:</p>
            <img src={totpSetup.qrCodeUrl} alt="TOTP QR Code" className="w-40 h-40 rounded-lg bg-white p-2" />
            <div className="flex gap-2">
              <input value={totpCode} onChange={(e) => setTotpCode(e.target.value)} placeholder="Enter 6-digit code"
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" maxLength={6} />
              <button onClick={verifyTOTP} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg">Verify</button>
            </div>
          </div>
        )}
      </div>

      {/* Passkeys */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="font-semibold text-white mb-1">Passkeys & Security Keys</h2>
        <p className="text-sm text-gray-400 mb-4">Phishing-resistant hardware keys and biometrics.</p>

        {user?.passkeys?.length > 0 ? (
          <div className="space-y-2 mb-4">
            {user.passkeys.map((pk: any) => (
              <div key={pk.credentialId} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                <div>
                  <div className="text-sm font-medium text-white">{pk.name || "Security Key"}</div>
                  <div className="text-xs text-gray-400">Added {new Date(pk.createdAt).toLocaleDateString()}</div>
                </div>
                <span className="text-xs text-gray-500">🔑</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 mb-4">No passkeys registered yet.</p>
        )}

        <button onClick={() => alert("Passkey registration requires @simplewebauthn/browser. Implement in your app.")}
          className="px-4 py-2 border border-gray-700 hover:border-gray-500 text-gray-300 hover:text-white text-sm rounded-lg transition-colors">
          + Add Passkey
        </button>
      </div>

      {/* OAuth */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="font-semibold text-white mb-1">Connected Accounts</h2>
        <p className="text-sm text-gray-400 mb-4">Social login providers linked to your account.</p>
        <div className="space-y-2">
          {["google", "github", "facebook", "apple"].map((provider) => {
            const linked = user?.oauthProviders?.some((p: any) => p.provider === provider);
            return (
              <div key={provider} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                <span className="text-sm text-white capitalize">{provider}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${linked ? "bg-emerald-900 text-emerald-300" : "bg-gray-700 text-gray-400"}`}>
                  {linked ? "Connected" : "Not connected"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

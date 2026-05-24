"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface TOTPStatus {
  enabled: boolean;
  qrCodeUrl?: string;
  secret?: string;
}

interface Passkey {
  id: string;
  name: string;
  createdAt: string;
}

export default function SecurityPage() {
  // TOTP
  const [totp, setTotp] = useState<TOTPStatus>({ enabled: false });
  const [totpSetupData, setTotpSetupData] = useState<{ qrCodeUrl: string; secret: string } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpError, setTotpError] = useState<string | null>(null);
  const [totpSuccess, setTotpSuccess] = useState<string | null>(null);

  // Passkeys
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [passkeysLoading, setPasskeysLoading] = useState(true);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  // Change password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState<string | null>(null);

  // Sessions
  const [revokeAllLoading, setRevokeAllLoading] = useState(false);

  useEffect(() => {
    // Fetch TOTP status
    api
      .get<TOTPStatus>("/auth/mfa/totp/status")
      .then(setTotp)
      .catch(() => {});

    // Fetch passkeys
    api
      .get<Passkey[]>("/auth/passkeys")
      .then(setPasskeys)
      .catch(() => {})
      .finally(() => setPasskeysLoading(false));
  }, []);

  const handleTOTPSetup = async () => {
    setTotpError(null);
    setTotpLoading(true);
    try {
      const data = await api.post<{ qrCodeUrl: string; secret: string }>(
        "/auth/mfa/totp/setup"
      );
      setTotpSetupData(data);
    } catch (err: unknown) {
      setTotpError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setTotpLoading(false);
    }
  };

  const handleTOTPVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setTotpError(null);
    setTotpLoading(true);
    try {
      await api.post("/auth/mfa/totp/verify", { code: totpCode });
      setTotp({ enabled: true });
      setTotpSetupData(null);
      setTotpCode("");
      setTotpSuccess("Authenticator app enabled successfully.");
    } catch (err: unknown) {
      setTotpError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setTotpLoading(false);
    }
  };

  const handleTOTPRemove = async () => {
    setTotpError(null);
    setTotpLoading(true);
    try {
      await api.delete("/auth/mfa/totp");
      setTotp({ enabled: false });
      setTotpSuccess("Authenticator app removed.");
    } catch (err: unknown) {
      setTotpError(err instanceof Error ? err.message : "Removal failed");
    } finally {
      setTotpLoading(false);
    }
  };

  const handleAddPasskey = async () => {
    setPasskeyError(null);
    try {
      await api.post("/auth/passkeys/register/options");
      // Full WebAuthn flow would go here
      setPasskeyError("WebAuthn registration requires browser support — coming soon.");
    } catch (err: unknown) {
      setPasskeyError(err instanceof Error ? err.message : "Failed to start passkey registration");
    }
  };

  const handleRemovePasskey = async (id: string) => {
    try {
      await api.delete(`/auth/passkeys/${id}`);
      setPasskeys((prev) => prev.filter((p) => p.id !== id));
    } catch (err: unknown) {
      setPasskeyError(err instanceof Error ? err.message : "Failed to remove passkey");
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(null);
    if (newPassword !== confirmPassword) {
      setPwError("New passwords do not match");
      return;
    }
    setPwLoading(true);
    try {
      await api.post("/auth/change-password", {
        currentPassword,
        newPassword,
      });
      setPwSuccess("Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: unknown) {
      setPwError(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setPwLoading(false);
    }
  };

  const handleRevokeAll = async () => {
    setRevokeAllLoading(true);
    try {
      await api.delete("/sessions");
    } catch {
      // ignore
    } finally {
      setRevokeAllLoading(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Security</h1>
        <p className="text-gray-400 text-sm mt-1">
          Manage your authentication methods and account security.
        </p>
      </div>

      {/* TOTP Section */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Authenticator App (TOTP)</h2>
            <p className="text-gray-400 text-sm mt-0.5">
              Use an authenticator app for two-factor authentication.
            </p>
          </div>
          <span
            className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              totp.enabled
                ? "bg-green-500/10 text-green-400 border border-green-500/20"
                : "bg-gray-800 text-gray-500 border border-gray-700"
            }`}
          >
            {totp.enabled ? "Enabled" : "Disabled"}
          </span>
        </div>

        {totpError && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
            {totpError}
          </div>
        )}
        {totpSuccess && (
          <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-sm px-4 py-3 rounded-lg">
            {totpSuccess}
          </div>
        )}

        {!totp.enabled && !totpSetupData && (
          <button
            onClick={handleTOTPSetup}
            disabled={totpLoading}
            className="border border-indigo-600 hover:bg-indigo-600/10 text-indigo-400 hover:text-indigo-300 px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {totpLoading ? "Loading…" : "Set Up"}
          </button>
        )}

        {totpSetupData && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Scan this QR code with your authenticator app (e.g. Google Authenticator, Authy):
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={totpSetupData.qrCodeUrl}
              alt="TOTP QR Code"
              className="w-40 h-40 bg-white p-2 rounded-lg"
            />
            <p className="text-xs text-gray-500">
              Or enter this secret manually:{" "}
              <span className="font-mono text-gray-300">{totpSetupData.secret}</span>
            </p>
            <form onSubmit={handleTOTPVerify} className="flex gap-3">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-36 bg-gray-800 border border-gray-700 focus:border-indigo-500 text-white placeholder-gray-600 rounded-lg px-3 py-2 text-sm font-mono outline-none"
              />
              <button
                type="submit"
                disabled={totpLoading || totpCode.length !== 6}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
              >
                {totpLoading ? "Verifying…" : "Verify & enable"}
              </button>
            </form>
          </div>
        )}

        {totp.enabled && (
          <button
            onClick={handleTOTPRemove}
            disabled={totpLoading}
            className="border border-red-800 hover:border-red-600 text-red-400 hover:text-red-300 px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {totpLoading ? "Removing…" : "Remove"}
          </button>
        )}
      </div>

      {/* Passkeys */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Passkeys</h2>
            <p className="text-gray-400 text-sm mt-0.5">
              Sign in securely using Touch ID, Face ID, or a hardware key.
            </p>
          </div>
          <button
            onClick={handleAddPasskey}
            className="border border-indigo-600 hover:bg-indigo-600/10 text-indigo-400 hover:text-indigo-300 px-3 py-1.5 rounded-lg text-xs transition-colors"
          >
            + Add passkey
          </button>
        </div>

        {passkeyError && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
            {passkeyError}
          </div>
        )}

        {passkeysLoading ? (
          <div className="text-gray-500 text-sm">Loading passkeys…</div>
        ) : passkeys.length === 0 ? (
          <p className="text-gray-500 text-sm">No passkeys registered yet.</p>
        ) : (
          <ul className="space-y-2">
            {passkeys.map((pk) => (
              <li
                key={pk.id}
                className="flex items-center justify-between py-2.5 px-3 bg-gray-800 rounded-lg"
              >
                <div>
                  <p className="text-sm text-white font-medium">{pk.name}</p>
                  <p className="text-xs text-gray-500">
                    Added {new Date(pk.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleRemovePasskey(pk.id)}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Change password */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Change password</h2>
          <p className="text-gray-400 text-sm mt-0.5">
            Choose a strong, unique password.
          </p>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4">
          {pwError && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
              {pwError}
            </div>
          )}
          {pwSuccess && (
            <div className="bg-green-500/10 border border-green-500/30 text-green-400 text-sm px-4 py-3 rounded-lg">
              {pwSuccess}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Current password
            </label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 text-white rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              New password
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 text-white rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Confirm new password
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 text-white rounded-lg px-3 py-2.5 text-sm outline-none transition-colors"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={pwLoading}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
            >
              {pwLoading ? "Updating…" : "Update password"}
            </button>
          </div>
        </form>
      </div>

      {/* Danger */}
      <div className="bg-gray-900 border border-red-900/50 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-red-400 mb-2">Sign out all devices</h2>
        <p className="text-gray-400 text-sm mb-4">
          This will revoke all active sessions except the current one.
        </p>
        <button
          onClick={handleRevokeAll}
          disabled={revokeAllLoading}
          className="border border-red-700 hover:border-red-500 text-red-400 hover:text-red-300 px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          {revokeAllLoading ? "Revoking…" : "Sign out all devices"}
        </button>
      </div>
    </div>
  );
}

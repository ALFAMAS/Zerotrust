"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface ConnectedProviders {
  google?: boolean;
  github?: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export default function SettingsPage() {
  const [providers, setProviders] = useState<ConnectedProviders>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<ConnectedProviders>("/auth/oauth/providers")
      .then(setProviders)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleDisconnect = async (provider: "google" | "github") => {
    setError(null);
    setActionLoading(provider);
    try {
      await api.delete(`/auth/oauth/${provider}`);
      setProviders((prev) => ({ ...prev, [provider]: false }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `Failed to disconnect ${provider}`);
    } finally {
      setActionLoading(null);
    }
  };

  const oauthProviders = [
    {
      id: "google" as const,
      name: "Google",
      icon: (
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
      ),
      connectUrl: `${API_BASE}/auth/oauth/google`,
    },
    {
      id: "github" as const,
      name: "GitHub",
      icon: (
        <svg className="w-5 h-5 fill-white" viewBox="0 0 24 24">
          <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
        </svg>
      ),
      connectUrl: `${API_BASE}/auth/oauth/github`,
    },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Connected Apps</h1>
        <p className="text-gray-400 text-sm mt-1">
          Manage OAuth providers linked to your account.
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-2xl divide-y divide-gray-800">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          oauthProviders.map((provider) => {
            const isConnected = !!providers[provider.id];
            return (
              <div
                key={provider.id}
                className="flex items-center justify-between px-6 py-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-gray-800 rounded-lg flex items-center justify-center">
                    {provider.icon}
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">{provider.name}</p>
                    <p className="text-gray-500 text-xs">
                      {isConnected ? "Connected" : "Not connected"}
                    </p>
                  </div>
                </div>
                <div>
                  {isConnected ? (
                    <button
                      onClick={() => handleDisconnect(provider.id)}
                      disabled={actionLoading === provider.id}
                      className="border border-gray-700 hover:border-red-700 text-gray-400 hover:text-red-400 px-3 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-50"
                    >
                      {actionLoading === provider.id ? "Disconnecting…" : "Disconnect"}
                    </button>
                  ) : (
                    <a
                      href={provider.connectUrl}
                      className="border border-indigo-600 hover:bg-indigo-600/10 text-indigo-400 hover:text-indigo-300 px-3 py-1.5 rounded-lg text-xs transition-colors"
                    >
                      Connect
                    </a>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

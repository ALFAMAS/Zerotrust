import { useState, useEffect, useCallback } from "react";
import { useZeroAuth } from "../context";

export interface SessionInfo {
  id: string;
  deviceName?: string;
  ipAddress?: string;
  createdAt: string;
  lastUsedAt: string;
  current?: boolean;
}

export function useSession() {
  const { client } = useZeroAuth();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await client.getSessions() as unknown as SessionInfo[];
      setSessions(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load sessions";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const revokeSession = useCallback(async (sessionId: string) => {
    await client.revokeSession(sessionId);
    setSessions(prev => prev.filter(s => s.id !== sessionId));
  }, [client]);

  return { sessions, loading, error, revokeSession, refresh: fetchSessions };
}

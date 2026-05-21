import { useState, useCallback } from "react";
import { useZeroAuth } from "../context";

export function useMagicLink() {
  const { client } = useZeroAuth();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMagicLink = useCallback(async (email: string, redirectUrl?: string) => {
    setLoading(true);
    setError(null);
    try {
      await client.sendMagicLink(email, redirectUrl);
      setSent(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to send magic link";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client]);

  const reset = useCallback(() => {
    setSent(false);
    setError(null);
  }, []);

  return { loading, sent, error, sendMagicLink, reset };
}

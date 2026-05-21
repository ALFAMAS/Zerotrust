import { useState, useCallback } from "react";
import { useZeroAuth } from "../context";

export function usePasskey() {
  const { client, refreshUser } = useZeroAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const registerPasskey = useCallback(async (_name?: string) => {
    setLoading(true);
    setError(null);
    try {
      const options = await client.getPasskeyRegistrationOptions();
      // NOTE: The caller must pass this to @simplewebauthn/browser's startRegistration()
      // then call registerPasskey with the response
      await refreshUser();
      return options;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Passkey registration failed";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client, refreshUser]);

  const authenticateWithPasskey = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const options = await client.getPasskeyAuthOptions();
      return options;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Passkey authentication failed";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client]);

  return { loading, error, registerPasskey, authenticateWithPasskey };
}

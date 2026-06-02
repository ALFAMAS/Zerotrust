import { useState, useCallback } from "react";
import { useZeroAuth } from "../context";

export function useMFA() {
  const { client, refreshUser } = useZeroAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totpSetup, setTotpSetup] = useState<{ qrCodeUrl: string; secret: string } | null>(null);

  const startTOTPSetup = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await client.setupTOTP() as { qrCodeUrl: string; secret: string };
      setTotpSetup(data);
      return data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "TOTP setup failed";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client]);

  const verifyTOTP = useCallback(async (code: string) => {
    setLoading(true);
    setError(null);
    try {
      await client.verifyTOTP(code);
      setTotpSetup(null);
      await refreshUser();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "TOTP verification failed";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client, refreshUser]);

  const sendOTP = useCallback(async (channel: "email" | "sms" | "whatsapp" | "telegram") => {
    setLoading(true);
    setError(null);
    try {
      await client.sendOTP(channel);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "OTP send failed";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client]);

  const verifyOTP = useCallback(async (channel: "email" | "sms" | "whatsapp" | "telegram", code: string) => {
    setLoading(true);
    setError(null);
    try {
      // SDK verifyOTP signature: (code, channel)
      await client.verifyOTP(code, channel);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "OTP verification failed";
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [client]);

  return { loading, error, totpSetup, startTOTPSetup, verifyTOTP, sendOTP, verifyOTP };
}

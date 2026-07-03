/**
 * Continuous access re-verification — client-side challenge flow.
 *
 * apiClient calls the registered handler when the API returns
 * REVERIFICATION_REQUIRED. ReverificationProvider mounts the dialog UI and
 * registers that handler on startup.
 */

import { apiPost } from "./apiClient";

export interface ReverificationContext {
  level?: string;
  reason?: string;
}

export interface ReverificationChallenge {
  type: "totp" | "otp" | "passkey";
  message?: string;
  channel?: string;
  options?: Record<string, unknown>;
}

type ReverificationHandler = (ctx: ReverificationContext) => Promise<boolean>;

let handler: ReverificationHandler | null = null;

export function registerReverificationHandler(next: ReverificationHandler | null): void {
  handler = next;
}

export function getReverificationHandler(): ReverificationHandler | null {
  return handler;
}

export function requestReverificationChallenge(
  type: "totp" | "otp" | "passkey" = "totp"
): Promise<ReverificationChallenge> {
  return apiPost<ReverificationChallenge>("/auth/verify/challenge", { type }, { skipReverify: true });
}

export function submitReverificationResponse(body: {
  type: "totp" | "otp" | "passkey";
  code?: string;
  response?: unknown;
}): Promise<{ verified: boolean; level?: string }> {
  return apiPost<{ verified: boolean; level?: string }>("/auth/verify/respond", body, {
    skipReverify: true,
  });
}

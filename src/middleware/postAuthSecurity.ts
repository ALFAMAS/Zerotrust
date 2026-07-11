/**
 * Opt-in post-authentication security middleware (Tier 5 #21).
 *
 * Device attestation and continuous evaluation run after `authMiddleware`
 * establishes user/session context. Enabled via env flags; configured from
 * `server.ts` during boot.
 */
import type { Context, MiddlewareHandler, Next } from "hono";
import { getLogger } from "../logger";
import type { HonoEnv } from "../shared/types";
import { createContinuousEvalMiddleware } from "./continuousEval";
import { deviceAttestationMiddleware } from "./deviceAttestation";

const logger = getLogger("post-auth-security");

let postAuthChain: MiddlewareHandler<HonoEnv>[] = [];

/** Read env flags and build the post-auth middleware chain. Call once at boot. */
export function initPostAuthSecurity(): void {
  postAuthChain = [];
  if (process.env.DEVICE_ATTESTATION_ENABLED === "true") {
    postAuthChain.push(deviceAttestationMiddleware);
    logger.info("Device attestation middleware enabled");
  }
  if (process.env.CONTINUOUS_EVAL_ENABLED === "true") {
    postAuthChain.push(createContinuousEvalMiddleware());
    logger.info("Continuous evaluation middleware enabled");
  }
}

export function isPostAuthSecurityEnabled(): boolean {
  return postAuthChain.length > 0;
}

/** Run registered post-auth middleware after successful authentication. */
export async function runPostAuthSecurity(c: Context<HonoEnv>, next: Next): Promise<void> {
  if (postAuthChain.length === 0) {
    return next();
  }

  let index = 0;
  const dispatch: Next = async () => {
    if (index >= postAuthChain.length) {
      await next();
      return;
    }
    const handler = postAuthChain[index]!;
    index += 1;
    await handler(c, dispatch);
  };
  await dispatch();
}

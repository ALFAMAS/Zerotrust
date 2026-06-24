import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { usersTable } from "../db/schema";
import { resolveDID } from "./resolver";
import type {
  DIDAuthChallenge,
  DIDAuthResult,
  DIDProof,
  VerificationMethod,
} from "./types";

const challenges = new Map<string, DIDAuthChallenge>();

export function createDIDChallenge(
  did: string,
  domain: string,
): DIDAuthChallenge {
  const id = crypto.randomUUID();
  const challenge = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
  const record: DIDAuthChallenge = { id, did, challenge, domain, expiresAt };
  challenges.set(id, record);
  setTimeout(() => challenges.delete(id), 5 * 60 * 1000);
  return record;
}

function resolveVM(
  doc: import("./types").DIDDocument,
  vmRef: string | VerificationMethod,
): VerificationMethod | null {
  if (typeof vmRef === "object") return vmRef;
  return doc.verificationMethod.find((vm) => vm.id === vmRef) ?? null;
}

export async function verifyDIDProof(
  proof: DIDProof,
  challengeId: string,
): Promise<DIDAuthResult> {
  const stored = challenges.get(challengeId);
  if (!stored) return { verified: false, reason: "challenge_not_found" };
  if (stored.expiresAt < new Date()) {
    challenges.delete(challengeId);
    return { verified: false, reason: "challenge_expired" };
  }

  if (proof.challenge !== stored.challenge)
    return { verified: false, reason: "challenge_mismatch" };
  if (proof.domain !== stored.domain)
    return { verified: false, reason: "domain_mismatch" };
  if (proof.proofPurpose !== "authentication")
    return { verified: false, reason: "invalid_proof_purpose" };

  const didDoc = await resolveDID(stored.did);
  if (!didDoc) return { verified: false, reason: "did_resolution_failed" };

  const vmRef = didDoc.authentication.find((a) =>
    typeof a === "string"
      ? a === proof.verificationMethod
      : a.id === proof.verificationMethod,
  );
  if (!vmRef)
    return {
      verified: false,
      reason: "verification_method_not_found_in_authentication",
    };

  const vm = resolveVM(didDoc, vmRef);
  if (!vm) return { verified: false, reason: "verification_method_not_found" };

  // Build the signed data
  const signedData = JSON.stringify({
    did: stored.did,
    challenge: stored.challenge,
    domain: stored.domain,
    timestamp: proof.created,
  });

  try {
    const sigBytes = Buffer.from(proof.proofValue, "base64url");

    if (vm.publicKeyJwk) {
      const pubKey = crypto.createPublicKey({
        key: vm.publicKeyJwk as any,
        format: "jwk",
      });
      const algorithm =
        vm.publicKeyJwk.crv === "Ed25519" ? "ed25519" : "sha256";
      const valid = crypto.verify(
        algorithm === "ed25519" ? null : "sha256",
        Buffer.from(signedData),
        pubKey,
        sigBytes,
      );
      if (!valid) return { verified: false, reason: "signature_invalid" };
    } else if (vm.publicKeyMultibase) {
      // Ed25519 from multibase key
      const keyBytes = Buffer.from(vm.publicKeyMultibase.slice(1), "base64url");
      const pubKey = crypto.createPublicKey({
        key: keyBytes,
        format: "der",
        type: "spki",
      });
      const valid = crypto.verify(
        null,
        Buffer.from(signedData),
        pubKey,
        sigBytes,
      );
      if (!valid) return { verified: false, reason: "signature_invalid" };
    } else {
      return { verified: false, reason: "unsupported_key_format" };
    }
  } catch {
    return { verified: false, reason: "signature_verification_error" };
  }

  challenges.delete(challengeId);
  const method = stored.did.split(":")[1] as import("./types").DIDMethod;
  return { verified: true, did: stored.did, method };
}

/**
 * Find-or-create a local zerotrust user for a verified DID. Idempotent: a repeat
 * login for the same DID returns the existing user id. The account has no
 * password (DID proof-of-control is the credential) and is marked active +
 * email-verified, since control of the DID has already been cryptographically
 * proven by the time this is called.
 */
export async function provisionDIDUser(
  did: string,
  _didDocument: import("./types").DIDDocument,
): Promise<string> {
  const db = getDb();

  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.did, did))
    .limit(1);
  if (existing.length > 0) return existing[0].id;

  // Synthetic, stable, unique email derived from the DID (no real mailbox).
  const email = `${did.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}@did.local`;
  const [user] = await db
    .insert(usersTable)
    .values({
      email,
      did,
      displayName: did,
      status: "active",
      emailVerifiedAt: new Date(),
    })
    .returning();
  return user.id;
}

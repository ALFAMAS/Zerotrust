/**
 * Minimal WebAuthn client helpers.
 *
 * The backend (`/auth/passkey/*`) uses @simplewebauthn/server, which speaks the
 * standard base64url-encoded JSON shapes (`RegistrationResponseJSON` /
 * `AuthenticationResponseJSON`). Rather than pull in @simplewebauthn/browser as
 * a dependency, we do the small amount of ArrayBuffer<->base64url conversion the
 * native `navigator.credentials` API needs ourselves. This keeps the passkey UI
 * dependency-free and avoids the workspace install issues on this platform.
 */

export function isWebAuthnAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.credentials
  );
}

function base64urlToBuffer(base64url: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type Descriptor = { id: string; type: "public-key"; transports?: AuthenticatorTransport[] };

/**
 * Run a registration ceremony. `options` is the JSON returned by
 * POST /auth/passkey/register/options. Returns the attestation in the JSON
 * shape POST /auth/passkey/register/verify expects.
 */
export async function startRegistration(options: any): Promise<any> {
  if (!isWebAuthnAvailable()) throw new Error("Passkeys are not supported in this browser");

  const publicKey: PublicKeyCredentialCreationOptions = {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    user: { ...options.user, id: base64urlToBuffer(options.user.id) },
    excludeCredentials: (options.excludeCredentials ?? []).map((c: Descriptor) => ({
      ...c,
      id: base64urlToBuffer(c.id),
    })),
  };

  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential;
  if (!credential) throw new Error("Passkey registration was cancelled");

  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      attestationObject: bufferToBase64url(response.attestationObject),
      transports: typeof response.getTransports === "function" ? response.getTransports() : [],
    },
    clientExtensionResults: credential.getClientExtensionResults?.() ?? {},
  };
}

/**
 * Run an authentication ceremony. `options` is the JSON returned by
 * POST /auth/passkey/authenticate/options (including the `_challengeKey` the
 * server needs back). Returns the assertion in the JSON shape
 * POST /auth/passkey/authenticate/verify expects.
 */
export async function startAuthentication(options: any): Promise<any> {
  if (!isWebAuthnAvailable()) throw new Error("Passkeys are not supported in this browser");

  const publicKey: PublicKeyCredentialRequestOptions = {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    allowCredentials: (options.allowCredentials ?? []).map((c: Descriptor) => ({
      ...c,
      id: base64urlToBuffer(c.id),
    })),
  };
  // `_challengeKey` is server bookkeeping, not a WebAuthn field.
  delete (publicKey as any)._challengeKey;

  const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential;
  if (!credential) throw new Error("Passkey authentication was cancelled");

  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      authenticatorData: bufferToBase64url(response.authenticatorData),
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      signature: bufferToBase64url(response.signature),
      userHandle: response.userHandle ? bufferToBase64url(response.userHandle) : null,
    },
    clientExtensionResults: credential.getClientExtensionResults?.() ?? {},
  };
}

export { resolveDID, resolveDIDKey, resolveDIDWeb } from "./resolver";
export { createDIDChallenge, verifyDIDProof, provisionDIDUser } from "./verifier";
export { default as didRoutes } from "./routes";
export type { DIDDocument, DIDAuthChallenge, DIDProof, DIDAuthResult, VerificationMethod, DIDMethod } from "./types";

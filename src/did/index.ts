export { resolveDID, resolveDIDKey, resolveDIDWeb } from "./resolver";
export { default as didRoutes } from "./routes";
export type {
  DIDAuthChallenge,
  DIDAuthResult,
  DIDDocument,
  DIDMethod,
  DIDProof,
  VerificationMethod,
} from "./types";
export { createDIDChallenge, provisionDIDUser, verifyDIDProof } from "./verifier";

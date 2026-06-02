export { ZeroAuthClient } from "./client";
export { ZeroAuthSDKError, SDKErrorCodes } from "./errors";
export type { SDKErrorCode, ErrorDetail } from "./errors";
export {
  MemoryTokenStorage,
  LocalStorageTokenStorage,
  CookieTokenStorage,
  createTokenStorage,
} from "./token-storage";
export type {
  ZeroAuthClientConfig,
  TokenStorage,
  TokenStorageType,
  AuthResult,
  RegisterResult,
  LoginOptions,
  OAuthOptions,
  TOTPSetupResult,
  Session,
  User,
  UserUpdateInput,
  AuthState,
  MagicLinkResult,
  MFAChallengeInfo,
  PasskeyInfo,
  OAuthProviderInfo,
} from "./types";

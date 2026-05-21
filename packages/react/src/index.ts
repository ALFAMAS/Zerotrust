// Context & Provider
export { ZeroAuthProvider, ZeroAuthContext, useZeroAuth } from "./context";

// Hooks
export { useAuth } from "./hooks/useAuth";
export { useSession } from "./hooks/useSession";
export { useMFA } from "./hooks/useMFA";
export { usePasskey } from "./hooks/usePasskey";
export { useMagicLink } from "./hooks/useMagicLink";

// Components
export { AuthGuard } from "./components/AuthGuard";
export { withAuth } from "./components/withAuth";

// Types
export type { AuthUser, AuthState, ZeroAuthContextValue, ZeroAuthProviderProps } from "./types";
export type { SessionInfo } from "./hooks/useSession";

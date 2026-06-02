import { useZeroAuth } from "../context";

export function useAuth() {
  const { auth, login, logout, register, refreshUser } = useZeroAuth();
  return {
    user: auth.user,
    isAuthenticated: auth.isAuthenticated,
    isLoading: auth.isLoading,
    error: auth.error,
    login,
    logout,
    register,
    refreshUser,
  };
}

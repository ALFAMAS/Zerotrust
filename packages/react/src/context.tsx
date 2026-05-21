"use client"; // Next.js Server Components compatibility

import React, { createContext, useContext, useEffect, useReducer, useCallback, useRef } from "react";
import { ZeroAuthClient, createTokenStorage } from "@zeroauth/sdk";
import type { AuthState, AuthUser, ZeroAuthContextValue, ZeroAuthProviderProps } from "./types";

type AuthAction =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_USER"; payload: AuthUser | null }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "RESET" };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case "SET_LOADING": return { ...state, isLoading: action.payload };
    case "SET_USER": return { ...state, user: action.payload, isAuthenticated: !!action.payload, isLoading: false, error: null };
    case "SET_ERROR": return { ...state, error: action.payload, isLoading: false };
    case "RESET": return { user: null, isAuthenticated: false, isLoading: false, error: null };
    default: return state;
  }
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
};

export const ZeroAuthContext = createContext<ZeroAuthContextValue | null>(null);

export function ZeroAuthProvider({ baseUrl, children, tokenStorage = "localStorage", onAuthStateChange }: ZeroAuthProviderProps) {
  const [auth, dispatch] = useReducer(authReducer, initialState);
  const clientRef = useRef<ZeroAuthClient | null>(null);

  if (!clientRef.current) {
    clientRef.current = new ZeroAuthClient({
      baseUrl,
      tokenStorage: createTokenStorage(tokenStorage),
    });
  }

  const client = clientRef.current;

  const refreshUser = useCallback(async () => {
    try {
      const user = await client.getMe() as unknown as AuthUser;
      dispatch({ type: "SET_USER", payload: user });
      onAuthStateChange?.(user);
    } catch {
      dispatch({ type: "SET_USER", payload: null });
      onAuthStateChange?.(null);
    }
  }, [client, onAuthStateChange]);

  useEffect(() => {
    if (client.isAuthenticated()) {
      refreshUser();
    } else {
      dispatch({ type: "RESET" });
    }
  }, [client, refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    dispatch({ type: "SET_LOADING", payload: true });
    dispatch({ type: "SET_ERROR", payload: null });
    try {
      await client.login(email, password);
      await refreshUser();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed";
      dispatch({ type: "SET_ERROR", payload: message });
      throw err;
    }
  }, [client, refreshUser]);

  const logout = useCallback(async () => {
    try {
      await client.logout();
    } finally {
      dispatch({ type: "RESET" });
      onAuthStateChange?.(null);
    }
  }, [client, onAuthStateChange]);

  const register = useCallback(async (email: string, password: string, firstName?: string, lastName?: string) => {
    dispatch({ type: "SET_LOADING", payload: true });
    dispatch({ type: "SET_ERROR", payload: null });
    // SDK register accepts (email, password, displayName?)
    // Combine firstName + lastName into displayName if provided
    const displayName = [firstName, lastName].filter(Boolean).join(" ") || undefined;
    try {
      await client.register(email, password, displayName);
      await refreshUser();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Registration failed";
      dispatch({ type: "SET_ERROR", payload: message });
      throw err;
    }
  }, [client, refreshUser]);

  return (
    <ZeroAuthContext.Provider value={{ client, auth, login, logout, register, refreshUser }}>
      {children}
    </ZeroAuthContext.Provider>
  );
}

export function useZeroAuth(): ZeroAuthContextValue {
  const ctx = useContext(ZeroAuthContext);
  if (!ctx) throw new Error("useZeroAuth must be used within a ZeroAuthProvider");
  return ctx;
}

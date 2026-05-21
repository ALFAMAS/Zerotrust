"use client";
import React from "react";
import { useAuth } from "../hooks/useAuth";

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  loadingFallback?: React.ReactNode;
}

export function AuthGuard({ children, fallback = null, loadingFallback = null }: AuthGuardProps) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <>{loadingFallback}</>;
  if (!isAuthenticated) return <>{fallback}</>;
  return <>{children}</>;
}

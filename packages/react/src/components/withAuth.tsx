"use client";
import React from "react";
import { useAuth } from "../hooks/useAuth";

export function withAuth<P extends object>(
  Component: React.ComponentType<P>,
  FallbackComponent?: React.ComponentType
): React.FC<P> {
  return function WithAuthWrapper(props: P) {
    const { isAuthenticated, isLoading } = useAuth();
    if (isLoading) return null;
    if (!isAuthenticated) {
      if (FallbackComponent) return <FallbackComponent />;
      return null;
    }
    return <Component {...props} />;
  };
}

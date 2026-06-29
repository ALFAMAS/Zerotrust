"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface UseApiOptions<T = unknown> {
  /** Skip the initial fetch (fetch manually via refetch). */
  lazy?: boolean;
  /** Called after successful fetch. */
  onSuccess?: (data: T) => void;
  /** Called after failed fetch. */
  onError?: (err: Error) => void;
}

/**
 * Standard data-fetch hook for API calls.
 *
 * Replaces the common useEffect + api.get + setLoading + setError pattern
 * that appears in 50+ pages.
 *
 * Usage:
 *   const { data: sessions, loading, error, refetch } = useApi<Session[]>("/sessions");
 *
 *   if (loading) return <Spinner />;
 *   if (error) return <Error msg={error} />;
 *   return <SessionList sessions={data} />;
 */
export function useApi<T = any>(
  path: string | null,
  opts: UseApiOptions<T> = {}
): UseApiState<T> & { refetch: () => Promise<void> } {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: true,
    error: null,
  });
  const mountedRef = useRef(true);

  // Re-fetch only when the path changes; onSuccess/onError are caller-provided
  // and typically inline, so depending on them would recreate the callback every
  // render and loop the effect below.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on path only
  const fetch = useCallback(async () => {
    if (!path) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api.get<T>(path);
      if (!mountedRef.current) return;
      setState({ data, loading: false, error: null });
      opts.onSuccess?.(data);
    } catch (err: any) {
      if (!mountedRef.current) return;
      const message = err?.message ?? "Request failed";
      setState({ data: null, loading: false, error: message });
      opts.onError?.(err);
    }
  }, [path]);

  useEffect(() => {
    mountedRef.current = true;
    if (opts.lazy) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    fetch();
    return () => {
      mountedRef.current = false;
    };
  }, [fetch, opts.lazy]);

  return { ...state, refetch: fetch };
}

/**
 * Hook for paginated API responses.
 *
 * Usage:
 *   const { data, loading, pagination, page, setPage } = usePaginatedApi<Session>(
 *     "/sessions",
 *     { defaultLimit: 20 }
 *   );
 */
export function usePaginatedApi<T = any>(
  path: string | null,
  opts: UseApiOptions & { defaultLimit?: number; defaultPage?: number } = {}
) {
  const { defaultLimit = 20, defaultPage = 1, ...apiOpts } = opts;
  const [page, setPage] = useState(defaultPage);
  const [limit, setLimit] = useState(defaultLimit);

  const paginatedPath = path
    ? `${path}${path.includes("?") ? "&" : "?"}page=${page}&limit=${limit}`
    : null;

  const result = useApi<{
    data: T[];
    pagination: { total: number; totalPages: number; hasNext: boolean; hasPrev: boolean };
  }>(paginatedPath, apiOpts);

  return {
    ...result,
    items: result.data?.data ?? [],
    pagination: result.data?.pagination ?? null,
    page,
    setPage,
    setLimit,
  };
}

"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type { SearchParams, SearchResults } from "./types";

export const searchKeys = queryKeys.search;

const DEFAULT_SEARCH_LIMIT = 25;
const MIN_QUERY_LENGTH = 2;

export function normalizeSearchParams(
  params: SearchParams
): Required<Pick<SearchParams, "q" | "limit">> & SearchParams {
  return { ...params, q: params.q.trim(), limit: params.limit ?? DEFAULT_SEARCH_LIMIT };
}

export function buildSearchPath(params: SearchParams): string {
  const normalized = normalizeSearchParams(params);
  const search = new URLSearchParams({ q: normalized.q, limit: String(normalized.limit) });
  if (normalized.type) search.set("type", normalized.type);
  return `/search?${search.toString()}`;
}

export function fetchSearch(params: SearchParams): Promise<SearchResults> {
  const normalized = normalizeSearchParams(params);
  return apiGet<SearchResults>(buildSearchPath(normalized));
}

export function searchQueryOptions(params: SearchParams) {
  const normalized = normalizeSearchParams(params);
  return queryOptions({
    queryKey: searchKeys.results(normalized),
    queryFn: () => fetchSearch(normalized),
    enabled: normalized.q.length >= MIN_QUERY_LENGTH,
  });
}

export function useSearchQuery(params: SearchParams) {
  return useQuery(searchQueryOptions(params));
}

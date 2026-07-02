"use client";

import { queryOptions, useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type { AuditEntry, AuditVerifyResult } from "./types";

export const auditKeys = queryKeys.audit;

type AuditEntriesResponse = { data: AuditEntry[]; pagination?: unknown } | AuditEntry[];

export function fetchAuditEntries(): Promise<AuditEntriesResponse> {
  return apiGet<AuditEntriesResponse>("/admin/audit-logs");
}

export function fetchAuditVerify(): Promise<AuditVerifyResult> {
  return apiGet<AuditVerifyResult>("/admin/audit-logs/verify");
}

export function auditEntriesQueryOptions() {
  return queryOptions({
    queryKey: auditKeys.entries(),
    queryFn: fetchAuditEntries,
  });
}

export function auditVerifyQueryOptions() {
  return queryOptions({
    queryKey: auditKeys.verify(),
    queryFn: fetchAuditVerify,
    enabled: false,
  });
}

export function useAuditEntriesQuery() {
  return useQuery(auditEntriesQueryOptions());
}

/**
 * Verify is a manual action (not auto-fetched). Use `refetch` to trigger it.
 */
export function useAuditVerifyQuery() {
  return useQuery(auditVerifyQueryOptions());
}

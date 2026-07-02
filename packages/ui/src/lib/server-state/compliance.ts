"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPut } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type {
  PaginatedResponse,
  RiskAssessment,
  Soc2Control,
  Soc2ControlStatus,
  Soc2Readiness,
} from "./types";

export const complianceKeys = queryKeys.compliance;

export const SOC2_READINESS_PATH = "/compliance/soc2/readiness";
export const SOC2_CONTROLS_PATH = "/compliance/soc2/controls";

export const CONTROL_STATUSES: Soc2ControlStatus[] = ["implemented", "partial", "planned"];

export function buildRiskAssessmentPath(year: number): string {
  return `/compliance/risk-assessment/${year}`;
}

export function nextControlStatus(current: Soc2ControlStatus): Soc2ControlStatus {
  const idx = CONTROL_STATUSES.indexOf(current);
  return CONTROL_STATUSES[(idx + 1) % CONTROL_STATUSES.length];
}

export function fetchSoc2Readiness(): Promise<Soc2Readiness> {
  return apiGet<Soc2Readiness>(SOC2_READINESS_PATH);
}

export function fetchSoc2Controls(): Promise<Soc2Control[]> {
  return apiGet<PaginatedResponse<Soc2Control>>(SOC2_CONTROLS_PATH).then((res) => res.data ?? []);
}

export function fetchRiskAssessment(year: number): Promise<RiskAssessment> {
  return apiGet<RiskAssessment>(buildRiskAssessmentPath(year));
}

export function soc2ReadinessQueryOptions() {
  return queryOptions({
    queryKey: complianceKeys.soc2Readiness(),
    queryFn: fetchSoc2Readiness,
  });
}

export function soc2ControlsQueryOptions() {
  return queryOptions({
    queryKey: complianceKeys.soc2Controls(),
    queryFn: fetchSoc2Controls,
  });
}

export function riskAssessmentQueryOptions(year: number) {
  return queryOptions({
    queryKey: complianceKeys.riskAssessment(year),
    queryFn: () => fetchRiskAssessment(year),
  });
}

export function useSoc2ReadinessQuery() {
  return useQuery(soc2ReadinessQueryOptions());
}

export function useSoc2ControlsQuery() {
  return useQuery(soc2ControlsQueryOptions());
}

export function useRiskAssessmentQuery(year: number) {
  return useQuery(riskAssessmentQueryOptions(year));
}

interface CycleControlStatusContext {
  previous?: Soc2Control[];
}

export function useCycleControlStatusMutation() {
  const queryClient = useQueryClient();
  const controlsKey = complianceKeys.soc2Controls();

  return useMutation<{ success: boolean }, Error, Soc2Control, CycleControlStatusContext>({
    mutationFn: (control) => {
      const next = nextControlStatus(control.status);
      return apiPut<{ success: boolean }>(`/compliance/soc2/controls/${control.controlId}`, {
        status: next,
      });
    },
    onMutate: async (control) => {
      await queryClient.cancelQueries({ queryKey: controlsKey });
      const previous = queryClient.getQueryData<Soc2Control[]>(controlsKey);
      const next = nextControlStatus(control.status);
      queryClient.setQueryData<Soc2Control[]>(controlsKey, (current) =>
        (current ?? []).map((item) =>
          item.controlId === control.controlId ? { ...item, status: next } : item
        )
      );
      return { previous };
    },
    onError: (_error, _control, context) => {
      if (context?.previous) {
        queryClient.setQueryData(controlsKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: complianceKeys.soc2Readiness() });
      void queryClient.invalidateQueries({ queryKey: controlsKey });
    },
  });
}

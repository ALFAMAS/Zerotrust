"use client";

import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/apiClient";
import { queryKeys } from "./queryKeys";
import type {
  AcceptInviteInput,
  AcceptInviteResponse,
  CreateOrganizationInput,
  CreateOrgInviteInput,
  MyOrgInvite,
  OrganizationsListResponse,
  OrgDetailResponse,
  OrgInvite,
  OrgMemberRow,
  OrgSecurityPolicy,
  PaginatedResponse,
  SaveOrgSecurityPolicyInput,
  TransferOrganizationInput,
  UpdateOrganizationInput,
} from "./types";

export const organizationKeys = queryKeys.organizations;

export const ORGS_PATH = "/orgs";
export const ORG_INVITES_ACCEPT_PATH = "/orgs/invites/accept";
export const ORG_INVITES_MINE_PATH = "/orgs/invites/mine";

export function buildDeclineOrgInvitePath(inviteId: string): string {
  return `/orgs/invites/${inviteId}`;
}

export function buildOrgPath(orgId: string): string {
  return `${ORGS_PATH}/${orgId}`;
}

export function buildOrgMembersPath(orgId: string): string {
  return `${buildOrgPath(orgId)}/members`;
}

export function buildOrgInvitesPath(orgId: string): string {
  return `${buildOrgPath(orgId)}/invites`;
}

export function buildOrgInvitePath(orgId: string, inviteId: string): string {
  return `${buildOrgInvitesPath(orgId)}/${inviteId}`;
}

export function buildOrgMemberPath(orgId: string, userId: string): string {
  return `${buildOrgMembersPath(orgId)}/${userId}`;
}

export function buildOrgSecurityPolicyPath(orgId: string): string {
  return `${buildOrgPath(orgId)}/security/policy`;
}

export function buildOrgTransferPath(orgId: string): string {
  return `${buildOrgPath(orgId)}/transfer`;
}

export function fetchOrganizationsList(): Promise<OrganizationsListResponse> {
  return apiGet<OrganizationsListResponse>(ORGS_PATH);
}

export function organizationsListQueryOptions() {
  return queryOptions({
    queryKey: organizationKeys.list(),
    queryFn: fetchOrganizationsList,
  });
}

export function useOrganizationsListQuery() {
  return useQuery(organizationsListQueryOptions());
}

export function fetchOrganizationDetail(orgId: string): Promise<OrgDetailResponse> {
  return apiGet<OrgDetailResponse>(buildOrgPath(orgId));
}

export function organizationDetailQueryOptions(orgId: string, enabled = true) {
  return queryOptions({
    queryKey: organizationKeys.detail(orgId),
    queryFn: () => fetchOrganizationDetail(orgId),
    enabled: Boolean(orgId) && enabled,
  });
}

export function useOrganizationDetailQuery(orgId: string, enabled = true) {
  return useQuery(organizationDetailQueryOptions(orgId, enabled));
}

export function fetchOrganizationMembers(orgId: string): Promise<PaginatedResponse<OrgMemberRow>> {
  return apiGet<PaginatedResponse<OrgMemberRow>>(buildOrgMembersPath(orgId));
}

export function organizationMembersQueryOptions(orgId: string, enabled = true) {
  return queryOptions({
    queryKey: organizationKeys.members(orgId),
    queryFn: () => fetchOrganizationMembers(orgId),
    enabled: Boolean(orgId) && enabled,
  });
}

export function useOrganizationMembersQuery(orgId: string, enabled = true) {
  return useQuery(organizationMembersQueryOptions(orgId, enabled));
}

export function fetchOrganizationInvites(orgId: string): Promise<PaginatedResponse<OrgInvite>> {
  return apiGet<PaginatedResponse<OrgInvite>>(buildOrgInvitesPath(orgId));
}

export function organizationInvitesQueryOptions(orgId: string, enabled = true) {
  return queryOptions({
    queryKey: organizationKeys.invites(orgId),
    queryFn: () => fetchOrganizationInvites(orgId),
    enabled: Boolean(orgId) && enabled,
  });
}

export function useOrganizationInvitesQuery(orgId: string, enabled = true) {
  return useQuery(organizationInvitesQueryOptions(orgId, enabled));
}

export function fetchOrganizationSecurityPolicy(
  orgId: string
): Promise<{ policy: OrgSecurityPolicy } | null> {
  return apiGet<{ policy: OrgSecurityPolicy }>(buildOrgSecurityPolicyPath(orgId)).catch(() => null);
}

export function organizationSecurityPolicyQueryOptions(orgId: string, enabled = true) {
  return queryOptions({
    queryKey: organizationKeys.securityPolicy(orgId),
    queryFn: () => fetchOrganizationSecurityPolicy(orgId),
    enabled: Boolean(orgId) && enabled,
  });
}

export function useOrganizationSecurityPolicyQuery(orgId: string, enabled = true) {
  return useQuery(organizationSecurityPolicyQueryOptions(orgId, enabled));
}

export function useCreateOrganizationMutation() {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, CreateOrganizationInput>({
    mutationFn: (input) => apiPost(ORGS_PATH, input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.list() });
    },
  });
}

export function useCreateOrgInviteMutation(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, CreateOrgInviteInput>({
    mutationFn: (input) => apiPost(buildOrgInvitesPath(orgId), input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.invites(orgId) });
    },
  });
}

export function useRevokeOrgInviteMutation(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, string>({
    mutationFn: (inviteId) => apiDelete(buildOrgInvitePath(orgId, inviteId)),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.invites(orgId) });
    },
  });
}

export function useLeaveOrganizationMutation(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, string>({
    mutationFn: (userId) => apiDelete(buildOrgMemberPath(orgId, userId)),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.all });
    },
  });
}

export function useUpdateOrganizationMutation(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation<{ org: OrgDetailResponse["org"] }, Error, UpdateOrganizationInput>({
    mutationFn: (input) => apiPut<{ org: OrgDetailResponse["org"] }>(buildOrgPath(orgId), input),
    onSuccess: (result) => {
      queryClient.setQueryData(
        organizationKeys.detail(orgId),
        (current: OrgDetailResponse | undefined) =>
          current ? { ...current, org: result.org } : current
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.detail(orgId) });
      void queryClient.invalidateQueries({ queryKey: organizationKeys.list() });
    },
  });
}

export function useSaveOrgSecurityPolicyMutation(orgId: string) {
  const queryClient = useQueryClient();
  const policyKey = organizationKeys.securityPolicy(orgId);

  return useMutation<{ policy: OrgSecurityPolicy }, Error, SaveOrgSecurityPolicyInput>({
    mutationFn: (input) =>
      apiPut<{ policy: OrgSecurityPolicy }>(buildOrgSecurityPolicyPath(orgId), input),
    onSuccess: (result) => {
      queryClient.setQueryData(policyKey, result);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: policyKey });
    },
  });
}

export function useTransferOrganizationMutation(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, TransferOrganizationInput>({
    mutationFn: (input) => apiPost(buildOrgTransferPath(orgId), input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.detail(orgId) });
      void queryClient.invalidateQueries({ queryKey: organizationKeys.members(orgId) });
    },
  });
}

export function useDeleteOrganizationMutation(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, void>({
    mutationFn: () => apiDelete(buildOrgPath(orgId)),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.all });
    },
  });
}

export function useAcceptInviteMutation() {
  const queryClient = useQueryClient();

  return useMutation<AcceptInviteResponse, Error, AcceptInviteInput>({
    mutationFn: (input) => apiPost<AcceptInviteResponse>(ORG_INVITES_ACCEPT_PATH, input),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.all });
    },
  });
}

export function fetchMyOrgInvites(): Promise<PaginatedResponse<MyOrgInvite>> {
  return apiGet<PaginatedResponse<MyOrgInvite>>(ORG_INVITES_MINE_PATH);
}

export function myOrgInvitesQueryOptions() {
  return queryOptions({
    queryKey: organizationKeys.myInvites(),
    queryFn: fetchMyOrgInvites,
  });
}

export function useMyOrgInvitesQuery() {
  return useQuery(myOrgInvitesQueryOptions());
}

export function useDeclineOrgInviteMutation() {
  const queryClient = useQueryClient();

  return useMutation<unknown, Error, string>({
    mutationFn: (inviteId) => apiDelete(buildDeclineOrgInvitePath(inviteId)),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKeys.myInvites() });
    },
  });
}

/** SCIM 2.0 resource shapes (Users + Groups MVP). */

export const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
export const SCIM_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";
export const SCIM_LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
export const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";

export interface ScimUserResource {
  schemas: string[];
  id: string;
  externalId?: string;
  userName: string;
  name?: { formatted?: string; givenName?: string; familyName?: string };
  displayName?: string;
  active: boolean;
  emails?: Array<{ value: string; primary?: boolean }>;
  meta: {
    resourceType: "User";
    created: string;
    lastModified: string;
    location?: string;
  };
}

export interface ScimGroupResource {
  schemas: string[];
  id: string;
  displayName: string;
  members?: Array<{ value: string; display?: string }>;
  meta: {
    resourceType: "Group";
    created: string;
    lastModified: string;
    location?: string;
  };
}

export interface ScimListResponse<T> {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: T[];
}

export function scimList<T>(
  resources: T[],
  startIndex = 1,
  count?: number
): ScimListResponse<T> {
  const slice = count ? resources.slice(startIndex - 1, startIndex - 1 + count) : resources;
  return {
    schemas: [SCIM_LIST_SCHEMA],
    totalResults: resources.length,
    startIndex,
    itemsPerPage: slice.length,
    Resources: slice,
  };
}

export function scimError(detail: string, status: number) {
  return {
    schemas: [SCIM_ERROR_SCHEMA],
    detail,
    status: String(status),
  };
}

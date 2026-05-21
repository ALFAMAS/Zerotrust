export interface SCIMUser {
  schemas: string[];
  id?: string;
  externalId?: string;
  userName: string;
  name?: { givenName?: string; familyName?: string; formatted?: string };
  emails?: Array<{ value: string; primary?: boolean; type?: string }>;
  phoneNumbers?: Array<{ value: string; type?: string }>;
  active?: boolean;
  groups?: Array<{ value: string; display?: string }>;
  meta?: { resourceType: string; created?: string; lastModified?: string; location?: string };
}

export interface SCIMGroup {
  schemas: string[];
  id?: string;
  externalId?: string;
  displayName: string;
  members?: Array<{ value: string; display?: string }>;
  meta?: { resourceType: string; created?: string; lastModified?: string };
}

export interface SCIMListResponse<T> {
  schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: T[];
}

export interface SCIMError {
  schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"];
  status: string;
  scimType?: string;
  detail?: string;
}

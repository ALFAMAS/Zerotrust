/**
 * LDAP / Active Directory type definitions for zerotrust
 */

export interface LDAPConfig {
  url: string; // ldap://dc.example.com:389 or ldaps://...
  baseDN: string; // DC=example,DC=com
  bindDN: string; // CN=svc-zerotrust,OU=ServiceAccounts,...
  bindPassword: string;
  userSearchBase?: string; // OU=Users,DC=example,DC=com
  userSearchFilter?: string; // (&(objectClass=person)(sAMAccountName={{username}}))
  groupSearchBase?: string;
  groupSearchFilter?: string; // (&(objectClass=group)(member={{dn}}))
  tlsOptions?: { rejectUnauthorized?: boolean; ca?: string };
  timeout?: number; // ms, default 5000
}

export interface LDAPUser {
  dn: string;
  sAMAccountName?: string;
  userPrincipalName?: string;
  mail?: string;
  givenName?: string;
  sn?: string;
  displayName?: string;
  memberOf?: string[];
  objectGUID?: string;
  whenCreated?: string;
  /** whenChanged is used for incremental sync */
  whenChanged?: string;
}

export interface LDAPGroup {
  dn: string;
  cn: string;
  member?: string[];
}

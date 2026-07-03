/** Per-organization branding overrides (white-label). */
export interface OrgBranding {
  appName?: string;
  brandColor?: string;
  logoUrl?: string;
  faviconUrl?: string;
  /** When true, hide all "Powered by zerotrust" badges. */
  hidePoweredBy?: boolean;
  /** Custom email "from" address (must be verified via custom email domain). */
  emailFromAddress?: string;
  /** Custom email domain (e.g. noreply@theirdomain.com). */
  emailDomain?: string;
  /** Custom login page URL — orgs can host their own login page. */
  customLoginUrl?: string;
}

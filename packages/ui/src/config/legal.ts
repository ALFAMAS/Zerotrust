export const legal = {
  companyName: process.env.NEXT_PUBLIC_COMPANY_NAME ?? "ZeroAuth",
  companyLegalName: process.env.NEXT_PUBLIC_COMPANY_LEGAL_NAME ?? "ZeroAuth, Inc.",
  companyAddress: process.env.NEXT_PUBLIC_COMPANY_ADDRESS ?? "",
  privacyEmail: process.env.NEXT_PUBLIC_PRIVACY_EMAIL ?? "privacy@example.com",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@example.com",
  privacyEffectiveDate: process.env.NEXT_PUBLIC_PRIVACY_DATE ?? "January 1, 2026",
  termsEffectiveDate: process.env.NEXT_PUBLIC_TERMS_DATE ?? "January 1, 2026",
  jurisdiction: process.env.NEXT_PUBLIC_JURISDICTION ?? "the laws of the United States",
  dataRetentionDays: process.env.NEXT_PUBLIC_DATA_RETENTION_DAYS ?? "90",
  cookieDomain: process.env.NEXT_PUBLIC_COOKIE_DOMAIN ?? "localhost",
} as const;

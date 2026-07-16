import { z } from "zod";

export const createOrgSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(80).optional(),
});

export const orgInviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "member", "viewer"]).default("member"),
});

export const acceptOrgInviteSchema = z.object({
  token: z.string().min(1),
});

export const updateOrgSchema = z.object({
  name: z.string().trim().min(1, "Organization name is required").max(120).optional(),
  logoUrl: z
    .union([z.string().url("Enter a valid logo URL"), z.literal("").transform(() => null)])
    .nullable()
    .optional(),
  billingEmail: z
    .union([z.string().email("Enter a valid billing email"), z.literal("").transform(() => null)])
    .nullable()
    .optional(),
  version: z.number().int().nonnegative().optional(),
});

export const updateOrgSecurityPolicySchema = z.object({
  requirePasskeyAttestation: z.boolean().default(false),
  requireHardwarePasskey: z.boolean().default(false),
  allowedPasskeyAaguids: z.array(z.string()).default([]),
  deniedPasskeyAaguids: z.array(z.string()).default([]),
  ipAllowlist: z.array(z.string()).default([]),
  maxSessionAgeSeconds: z.number().int().min(0).default(0),
  idleTimeoutSeconds: z.number().int().min(0).default(0),
  maxConcurrentSessions: z.number().int().min(0).default(0),
  allowedCountries: z.array(z.string().length(2, "Use two-letter country codes")).default([]),
});

const splitPolicyList = (value: string, casing: "lower" | "upper" = "lower") =>
  value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (casing === "upper" ? item.toUpperCase() : item.toLowerCase()));

/** Browser-friendly policy fields transformed into the API request contract. */
export const orgSecurityPolicyFormSchema = z
  .object({
    requirePasskeyAttestation: z.boolean(),
    requireHardwarePasskey: z.boolean(),
    allowedPasskeyAaguids: z.string(),
    deniedPasskeyAaguids: z.string(),
    ipAllowlist: z.string(),
    maxSessionAgeMinutes: z.number().int().min(0, "Session age cannot be negative"),
    idleTimeoutMinutes: z.number().int().min(0, "Idle timeout cannot be negative"),
    maxConcurrentSessions: z.number().int().min(0, "Session limit cannot be negative"),
    allowedCountries: z.string(),
  })
  .transform((form) =>
    updateOrgSecurityPolicySchema.parse({
      requirePasskeyAttestation: form.requirePasskeyAttestation,
      requireHardwarePasskey: form.requireHardwarePasskey,
      allowedPasskeyAaguids: splitPolicyList(form.allowedPasskeyAaguids),
      deniedPasskeyAaguids: splitPolicyList(form.deniedPasskeyAaguids),
      ipAllowlist: splitPolicyList(form.ipAllowlist),
      maxSessionAgeSeconds: form.maxSessionAgeMinutes * 60,
      idleTimeoutSeconds: form.idleTimeoutMinutes * 60,
      maxConcurrentSessions: form.maxConcurrentSessions,
      allowedCountries: splitPolicyList(form.allowedCountries, "upper"),
    })
  );

export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type OrgInviteInput = z.infer<typeof orgInviteSchema>;
export type AcceptOrgInviteInput = z.infer<typeof acceptOrgInviteSchema>;
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;
export type UpdateOrgSecurityPolicyInput = z.infer<typeof updateOrgSecurityPolicySchema>;
export type OrgSecurityPolicyFormInput = z.input<typeof orgSecurityPolicyFormSchema>;

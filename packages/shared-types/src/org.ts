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

export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type OrgInviteInput = z.infer<typeof orgInviteSchema>;
export type AcceptOrgInviteInput = z.infer<typeof acceptOrgInviteSchema>;

import { z } from "zod";

export const AdminUpdateUserSchema = z.object({
  status: z.enum(["active", "suspended", "pending", "deleted"]).optional(),
  roles: z.array(z.string()).optional(),
  displayName: z.string().min(1).max(100).optional(),
});

export const AdminAssignRoleSchema = z.object({
  roleName: z.string().min(1, "Role name is required"),
});

export const AdminRevokeRoleSchema = z.object({
  roleName: z.string().min(1, "Role name is required"),
});

export const JITApproveSchema = z.object({
  comment: z.string().max(500).optional(),
});

export const JITDenySchema = z.object({
  reason: z.string().min(1, "Denial reason is required").max(500),
});

export const CreateRoleSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[a-z_:]+$/, "Role name must be lowercase with underscores/colons"),
  displayName: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  parentRoleName: z.string().optional(),
  permissions: z
    .array(
      z.object({
        resource: z.string().min(1),
        actions: z.array(z.string()),
        conditions: z
          .array(
            z.object({
              attribute: z.string(),
              operator: z.enum(["eq", "ne", "in", "nin", "gt", "lt", "gte", "lte", "contains"]),
              value: z.unknown(),
            })
          )
          .optional(),
      })
    )
    .default([]),
});

export type AdminUpdateUserInput = z.infer<typeof AdminUpdateUserSchema>;
export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;
export type JITApproveInput = z.infer<typeof JITApproveSchema>;
export type JITDenyInput = z.infer<typeof JITDenySchema>;

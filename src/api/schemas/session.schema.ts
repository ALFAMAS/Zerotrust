import { z } from "zod";

export const RevokeSessionSchema = z.object({
  reason: z.string().max(200).optional(),
});

export const ListSessionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  activeOnly: z.coerce.boolean().default(true),
});

export type RevokeSessionInput = z.infer<typeof RevokeSessionSchema>;
export type ListSessionsQuery = z.infer<typeof ListSessionsQuerySchema>;

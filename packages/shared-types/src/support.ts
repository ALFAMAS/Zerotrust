import { z } from "zod";

export const supportTicketSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, "Subject is required")
    .max(200, "Subject must be 200 characters or fewer"),
  message: z
    .string()
    .trim()
    .min(1, "Message is required")
    .max(5000, "Message must be 5000 characters or fewer"),
  priority: z.enum(["low", "normal", "high"]).optional(),
  orgId: z.string().uuid("Organization ID must be a UUID").optional(),
});

export const replySupportTicketSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Reply is required")
    .max(5000, "Reply must be 5000 characters or fewer"),
});

export type SupportTicketInput = z.infer<typeof supportTicketSchema>;
export type ReplySupportTicketInput = z.infer<typeof replySupportTicketSchema>;

import { z } from "zod";

/** Canonical API error envelope returned by Hono handlers and consumed by the UI client. */
export const apiErrorEnvelopeSchema = z.object({
  error: z.string().min(1),
  message: z.string().optional(),
  detail: z.unknown().optional(),
});

export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;

export const validationErrorEnvelopeSchema = apiErrorEnvelopeSchema.extend({
  error: z.literal("VALIDATION_ERROR"),
  message: z.string(),
});

export type ValidationErrorEnvelope = z.infer<typeof validationErrorEnvelopeSchema>;

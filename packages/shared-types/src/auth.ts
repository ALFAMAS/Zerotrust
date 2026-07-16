import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one digit")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

/** Core register fields shared by API validation and the UI register form. */
export const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: passwordSchema,
  displayName: z.string().min(1).max(100).optional(),
});

/** Register body including optional PoW, locale, and CAPTCHA fields. */
export const registerBodySchema = registerSchema.extend({
  locale: z.string().optional(),
  powChallenge: z.string().optional(),
  powSolution: z.string().optional(),
  captchaToken: z.string().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type RegisterBodyInput = z.infer<typeof registerBodySchema>;

/** Core login fields shared by API validation and the UI login form. */
export const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;

/** Password complexity rules — reused by password-reset confirm on the API. */
export const passwordSchemaExport = passwordSchema;

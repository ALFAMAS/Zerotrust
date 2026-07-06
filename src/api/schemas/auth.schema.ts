import { z } from "zod";

const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one digit")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

export const RegisterSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: passwordSchema,
  displayName: z.string().min(1).max(100).optional(),
});

/** Register body including optional PoW, locale, and CAPTCHA fields. */
export const RegisterBodySchema = RegisterSchema.extend({
  locale: z.string().optional(),
  powChallenge: z.string().optional(),
  powSolution: z.string().optional(),
  captchaToken: z.string().optional(),
});

export const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

/** Login body including optional PoW and CAPTCHA fields for progressive backoff. */
export const LoginBodySchema = LoginSchema.extend({
  powChallenge: z.string().optional(),
  powSolution: z.string().optional(),
  captchaToken: z.string().optional(),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "refreshToken is required"),
});

export const PasswordResetRequestSchema = z.object({
  email: z.string().email("Invalid email address"),
  channel: z.enum(["email"]).default("email"),
  captchaToken: z.string().optional(),
});

export const PasswordResetConfirmSchema = z.object({
  email: z.string().email("Invalid email address"),
  code: z.string().min(4, "Code is required"),
  newPassword: passwordSchema,
});

export const LogoutSchema = z.object({
  sessionId: z.string().optional(),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;
export type PasswordResetRequestInput = z.infer<typeof PasswordResetRequestSchema>;
export type PasswordResetConfirmInput = z.infer<typeof PasswordResetConfirmSchema>;

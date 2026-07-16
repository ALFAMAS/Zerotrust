import {
  loginSchema,
  passwordSchemaExport as passwordSchema,
  type RegisterBodyInput,
  type RegisterInput,
  registerBodySchema,
  registerSchema,
} from "@zerotrust/shared-types";
import { z } from "zod";

export const RegisterSchema = registerSchema;

/** Register body including optional PoW, locale, and CAPTCHA fields. */
export const RegisterBodySchema = registerBodySchema;

export const LoginSchema = loginSchema;

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

export type { RegisterBodyInput, RegisterInput };
export type LoginInput = z.infer<typeof LoginSchema>;
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;
export type PasswordResetRequestInput = z.infer<typeof PasswordResetRequestSchema>;
export type PasswordResetConfirmInput = z.infer<typeof PasswordResetConfirmSchema>;

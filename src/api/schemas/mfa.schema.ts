import { z } from "zod";

export const TOTPVerifySchema = z.object({
  code: z
    .string()
    .length(6, "TOTP code must be 6 digits")
    .regex(/^\d+$/, "TOTP code must be numeric"),
});

export const BackupCodeRedeemSchema = z.object({
  code: z.string().min(8, "Backup code is required"),
});

export const MFASendOTPSchema = z.object({
  channel: z.enum(["email", "sms", "whatsapp", "telegram"]),
  target: z.string().min(1, "Target (email/phone/chat ID) is required"),
});

export const MFAVerifyOTPSchema = z.object({
  code: z.string().min(4, "OTP code is required"),
  channel: z.enum(["email", "sms", "whatsapp", "telegram"]),
});

export type TOTPVerifyInput = z.infer<typeof TOTPVerifySchema>;
export type BackupCodeRedeemInput = z.infer<typeof BackupCodeRedeemSchema>;
export type MFASendOTPInput = z.infer<typeof MFASendOTPSchema>;
export type MFAVerifyOTPInput = z.infer<typeof MFAVerifyOTPSchema>;

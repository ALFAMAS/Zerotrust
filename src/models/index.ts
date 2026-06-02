export {
  usersTable,
  sessionsTable,
  rolesTable,
  jitAccessTable,
  auditLogsTable,
  refreshTokensTable,
  otpsTable,
  workloadCredentialsTable,
  saasSettingsTable,
} from "../db/schema";

// Aliases for backward compat with code that uses *Model names
export { usersTable as UserModel } from "../db/schema";
export { sessionsTable as SessionModel } from "../db/schema";
export { rolesTable as RoleModel } from "../db/schema";
export { jitAccessTable as JITModel } from "../db/schema";
export { auditLogsTable as AuditModel } from "../db/schema";
export { refreshTokensTable as RefreshTokenModel } from "../db/schema";
export { otpsTable as OTPModel } from "../db/schema";
export { workloadCredentialsTable as WorkloadCredentialModel } from "../db/schema";

// Re-export types
export type { User as UserDocument } from "../shared/types";
export type { Session as SessionDocument } from "../shared/types";
export type { Role as RoleDocument } from "../shared/types";
export type { JITAccessRequest as JITDocument } from "../shared/types";
export type { AuditLog as AuditDocument } from "../shared/types";
export type { RefreshTokenRecord as RefreshTokenDocument } from "../shared/types";
export type { OTP as OTPDocument } from "../shared/types";

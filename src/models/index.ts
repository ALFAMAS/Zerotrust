// Aliases for backward compat with code that uses *Model names
export {
  auditLogsTable,
  auditLogsTable as AuditModel,
  jitAccessTable,
  jitAccessTable as JITModel,
  otpsTable,
  otpsTable as OTPModel,
  refreshTokensTable,
  refreshTokensTable as RefreshTokenModel,
  rolesTable,
  rolesTable as RoleModel,
  saasSettingsTable,
  sessionsTable,
  sessionsTable as SessionModel,
  usersTable,
  usersTable as UserModel,
  workloadCredentialsTable,
  workloadCredentialsTable as WorkloadCredentialModel,
} from "../db/schema";
// Re-export types
export type {
  AuditLog as AuditDocument,
  JITAccessRequest as JITDocument,
  OTP as OTPDocument,
  RefreshTokenRecord as RefreshTokenDocument,
  Role as RoleDocument,
  Session as SessionDocument,
  User as UserDocument,
} from "../shared/types";

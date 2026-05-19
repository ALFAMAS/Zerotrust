import mongoose, { Schema, Document } from "mongoose";
import type {
  Session,
  Role,
  JITAccessRequest,
  AuditLog,
  RefreshTokenRecord,
  OTP,
} from "../shared/types";

// ─── Session ─────────────────────────────────────────────────────────────────

export type SessionDocument = Omit<Session, "_id"> & Document;

const DeviceFingerprintSchema = new Schema({
  hash: { type: String, required: true },
  platform: String,
  browser: String,
  os: String,
  screen: String,
  timezone: String,
  languages: [String],
  isTrusted: { type: Boolean, default: false },
  firstSeenAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
});

const SessionSchema = new Schema<SessionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenId: { type: String, required: true, unique: true },
    deviceFingerprint: DeviceFingerprintSchema,
    ipAddress: { type: String, required: true },
    country: String,
    userAgent: String,
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    lastActivityAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true, index: true },
    revokedAt: Date,
    revokedReason: String,
    proofOfPossessionKey: String,
    continuousEvalResult: {
      decision: { type: String, enum: ["allow", "deny", "challenge"] },
      riskScore: Number,
      evaluatedAt: Date,
    },
    anomalyFlags: {
      deviceChangeDetected: { type: Boolean, default: false },
      locationChangeDetected: { type: Boolean, default: false },
      timeAnomalyDetected: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

SessionSchema.index({ userId: 1, isActive: 1 });
SessionSchema.index({ "deviceFingerprint.hash": 1 });

export const SessionModel = mongoose.model<SessionDocument>("Session", SessionSchema);

// ─── Role ─────────────────────────────────────────────────────────────────────

export type RoleDocument = Omit<Role, "_id"> & Document;

const ABACConditionSchema = new Schema({
  attribute: String,
  operator: { type: String, enum: ["eq", "ne", "in", "nin", "gt", "lt", "gte", "lte", "contains"] },
  value: Schema.Types.Mixed,
});

const PermissionSchema = new Schema({
  resource: { type: String, required: true },
  actions: [String],
  conditions: [ABACConditionSchema],
});

const RoleSchema = new Schema<RoleDocument>(
  {
    name: { type: String, required: true, unique: true },
    displayName: { type: String, required: true },
    description: String,
    permissions: [PermissionSchema],
    parentRoleId: { type: Schema.Types.ObjectId, ref: "Role" },
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const RoleModel = mongoose.model<RoleDocument>("Role", RoleSchema);

// ─── JIT Access ───────────────────────────────────────────────────────────────

export type JITDocument = Omit<JITAccessRequest, "_id"> & Document;

const JITSchema = new Schema<JITDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    roleId: { type: Schema.Types.ObjectId, ref: "Role", required: true },
    reason: { type: String, required: true },
    requestedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    approvedAt: Date,
    status: {
      type: String,
      enum: ["pending", "approved", "denied", "expired", "revoked"],
      default: "pending",
      index: true,
    },
    revokedAt: Date,
    revokedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const JITModel = mongoose.model<JITDocument>("JITAccess", JITSchema);

// ─── Audit Log ────────────────────────────────────────────────────────────────

export type AuditDocument = Omit<AuditLog, "_id"> & Document;

const AuditSchema = new Schema<AuditDocument>({
  action: { type: String, required: true, index: true },
  actorId: { type: Schema.Types.ObjectId, ref: "User", index: true },
  actorEmail: String,
  targetId: String,
  targetType: String,
  ipAddress: String,
  country: String,
  userAgent: String,
  deviceHash: String,
  sessionId: String,
  success: { type: Boolean, required: true, index: true },
  errorCode: String,
  duration: Number,
  resourceDetails: { type: Map, of: Schema.Types.Mixed },
  riskScore: Number,
  continuousEvalContext: { type: Map, of: Schema.Types.Mixed },
  metadata: { type: Map, of: Schema.Types.Mixed },
  timestamp: { type: Date, default: Date.now, index: true },
});

AuditSchema.index({ actorId: 1, timestamp: -1 });
AuditSchema.index({ action: 1, timestamp: -1 });
AuditSchema.index({ ipAddress: 1, timestamp: -1 });

export const AuditModel = mongoose.model<AuditDocument>("AuditLog", AuditSchema);

// ─── Refresh Token ────────────────────────────────────────────────────────────

export type RefreshTokenDocument = Omit<RefreshTokenRecord, "_id"> & Document;

const RefreshTokenSchema = new Schema<RefreshTokenDocument>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  sessionId: { type: Schema.Types.ObjectId, ref: "Session", required: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  usedAt: Date,
  isRevoked: { type: Boolean, default: false },
});

export const RefreshTokenModel = mongoose.model<RefreshTokenDocument>("RefreshToken", RefreshTokenSchema);

// ─── OTP / Password Reset ─────────────────────────────────────────────────────

export interface OTPDocument extends Document {
  userId: string;
  code: string;
  type: "password_reset" | "email_verify" | "phone_verify" | "login";
  channel: "email" | "sms" | "whatsapp" | "telegram";
  target: string; // email or phone
  expiresAt: Date;
  usedAt?: Date;
  attempts: number;
}

const OTPSchema = new Schema<OTPDocument>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  code: { type: String, required: true },
  type: { type: String, enum: ["password_reset", "email_verify", "phone_verify", "login"], required: true },
  channel: { type: String, enum: ["email", "sms", "whatsapp", "telegram"], required: true },
  target: { type: String, required: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  usedAt: Date,
  attempts: { type: Number, default: 0 },
});

OTPSchema.index({ userId: 1, type: 1 });

export const OTPModel = mongoose.model<OTPDocument>("OTP", OTPSchema);
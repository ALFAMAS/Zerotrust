import mongoose, { Schema, Document } from "mongoose";
import type { User } from "../shared/types";
import { csflEncryptionPlugin } from "../crypto/csfle";

export type UserDocument = Omit<User, "_id"> & Document;

const PasskeySchema = new Schema({
  credentialId: { type: String, required: true },
  publicKey: { type: String, required: true },
  counter: { type: Number, default: 0 },
  deviceType: { type: String },
  backedUp: { type: Boolean, default: false },
  transports: [String],
  name: String,
  createdAt: { type: Date, default: Date.now },
  lastUsedAt: Date,
});

const OAuthProviderSchema = new Schema({
  provider: { type: String, enum: ["google", "facebook"], required: true },
  providerId: { type: String, required: true },
  email: String,
  connectedAt: { type: Date, default: Date.now },
});

const ScheduleRestrictionSchema = new Schema({
  enabled: { type: Boolean, default: false },
  timezone: { type: String, default: "UTC" },
  allowedDays: [{ type: Number, min: 0, max: 6 }],
  allowedHoursStart: { type: Number, min: 0, max: 23, default: 0 },
  allowedHoursEnd: { type: Number, min: 0, max: 23, default: 23 },
});

const UserSchema = new Schema<UserDocument>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    username: { type: String, unique: true, sparse: true, trim: true },
    passwordHash: String,
    phone: String,
    displayName: { type: String, required: true },
    avatarUrl: String,
    roles: [{ type: String }],
    attributes: {
      country: String,
      timezone: String,
      department: String,
      employeeId: String,
      clearanceLevel: { type: Number, default: 0 },
      customAttributes: { type: Map, of: Schema.Types.Mixed },
    },
    mfa: {
      totp: {
        enabled: { type: Boolean, default: false },
        secret: String,
        backupCodes: [String],
        verifiedAt: Date,
      },
      webauthn: {
        enabled: { type: Boolean, default: false },
      },
    },
    passkeys: [PasskeySchema],
    oauthProviders: [OAuthProviderSchema],
    status: {
      type: String,
      enum: ["active", "suspended", "pending", "deleted"],
      default: "pending",
    },
    parentUserId: { type: Schema.Types.ObjectId, ref: "User" },
    subUserIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    sessionConfig: {
      maxDevices: { type: Number, default: 5 },
      allowedCountries: [String],
      allowedIpRanges: [String],
      scheduleRestriction: ScheduleRestrictionSchema,
    },
    lastLoginAt: Date,
    metadata: { type: Map, of: Schema.Types.Mixed },
  },
  { timestamps: true }
);

UserSchema.index({ "oauthProviders.provider": 1, "oauthProviders.providerId": 1 });
UserSchema.index({ parentUserId: 1 });
UserSchema.index({ status: 1 });

// Apply CSFLE encryption plugin
const fieldsToEncrypt = [
  "email",
  "phone",
  "passwordHash",
  "mfa.totp.secret",
  "attributes.customAttributes",
];
UserSchema.plugin(csflEncryptionPlugin, { fields: fieldsToEncrypt });

export const UserModel = mongoose.model<UserDocument>("User", UserSchema);
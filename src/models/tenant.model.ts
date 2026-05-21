import mongoose, { Schema, Document } from "mongoose";

export interface TenantDocument extends Document {
  slug: string;
  name: string;
  displayName: string;
  status: "active" | "suspended" | "trial";
  plan: "free" | "pro" | "enterprise";
  settings: {
    allowedDomains: string[];
    enforceSSO: boolean;
    mfaRequired: boolean;
    sessionTTL: number;
    maxUsers: number;
    allowedCountries: string[];
    customBrandingUrl?: string;
  };
  oidcConfig?: {
    enabled: boolean;
    clientId: string;
    redirectUris: string[];
    scopes: string[];
  };
  samlConfig?: {
    enabled: boolean;
    idpEntityId: string;
    idpSsoUrl: string;
    idpCert: string;
    spEntityId: string;
    attributeMap: Record<string, string>;
  };
  createdAt?: Date;
  updatedAt?: Date;
}

const TenantSchema = new Schema<TenantDocument>(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true },
    displayName: { type: String, required: true },
    status: {
      type: String,
      enum: ["active", "suspended", "trial"],
      default: "active",
    },
    plan: {
      type: String,
      enum: ["free", "pro", "enterprise"],
      default: "free",
    },
    settings: {
      allowedDomains: [String],
      enforceSSO: { type: Boolean, default: false },
      mfaRequired: { type: Boolean, default: false },
      sessionTTL: { type: Number, default: 3600 },
      maxUsers: { type: Number, default: 100 },
      allowedCountries: [String],
      customBrandingUrl: String,
    },
    oidcConfig: {
      enabled: { type: Boolean, default: false },
      clientId: String,
      redirectUris: [String],
      scopes: [String],
    },
    samlConfig: {
      enabled: { type: Boolean, default: false },
      idpEntityId: String,
      idpSsoUrl: String,
      idpCert: String,
      spEntityId: String,
      attributeMap: { type: Map, of: String },
    },
  },
  { timestamps: true }
);

TenantSchema.index({ status: 1 });

export const TenantModel = mongoose.model<TenantDocument>("Tenant", TenantSchema);

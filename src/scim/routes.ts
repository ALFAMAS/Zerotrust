/**
 * SCIM 2.0 (RFC 7644) — User provisioning endpoints
 * Mounted at /scim/v2
 *
 * Compatible with Azure AD, Okta, and other enterprise IdPs.
 */

import { Router, Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { UserModel } from "../models/user.model";
import { RoleModel } from "../models";
import { userToSCIM, scimToUserFields, scimError, parseSCIMFilter } from "./utils";
import type { SCIMListResponse, SCIMUser, SCIMGroup } from "./types";

const router = Router();

// ─── Bearer Token Auth ────────────────────────────────────────────────────────

function scimAuth(req: Request, res: Response, next: NextFunction): void {
  const token = process.env.SCIM_API_TOKEN;
  if (!token) {
    // If no token is configured, allow all (dev mode)
    return next();
  }

  const authHeader = req.headers.authorization ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || match[1] !== token) {
    res.status(401).json(
      scimError(401, "Invalid or missing Bearer token", "invalidValue")
    );
    return;
  }
  next();
}

router.use(scimAuth);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getBaseUrl(req: Request): string {
  return `${req.protocol}://${req.get("host")}`;
}

function isObjectId(value: string): boolean {
  return (
    mongoose.Types.ObjectId.isValid(value) &&
    String(new mongoose.Types.ObjectId(value)) === value
  );
}

// ─── GET /ServiceProviderConfig ───────────────────────────────────────────────

router.get("/ServiceProviderConfig", (_req: Request, res: Response): void => {
  res.json({
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
    patch: { supported: true },
    bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
    filter: { supported: true, maxResults: 200 },
    changePassword: { supported: false },
    sort: { supported: false },
    etag: { supported: false },
    authenticationSchemes: [
      {
        type: "oauthbearertoken",
        name: "OAuth Bearer Token",
        description: "OAuth2 Bearer Token",
      },
    ],
  });
});

// ─── GET /Schemas ─────────────────────────────────────────────────────────────

router.get("/Schemas", (_req: Request, res: Response): void => {
  res.json([
    {
      id: "urn:ietf:params:scim:schemas:core:2.0:User",
      name: "User",
      description: "User Account",
      schemas: ["urn:ietf:params:scim:meta:schemas:User"],
      attributes: [
        { name: "userName", type: "string", required: true, uniqueness: "server" },
        { name: "name", type: "complex", subAttributes: [
          { name: "givenName", type: "string" },
          { name: "familyName", type: "string" },
          { name: "formatted", type: "string" },
        ]},
        { name: "emails", type: "complex", multiValued: true, subAttributes: [
          { name: "value", type: "string" },
          { name: "primary", type: "boolean" },
          { name: "type", type: "string" },
        ]},
        { name: "phoneNumbers", type: "complex", multiValued: true, subAttributes: [
          { name: "value", type: "string" },
          { name: "type", type: "string" },
        ]},
        { name: "active", type: "boolean" },
        { name: "externalId", type: "string" },
        { name: "groups", type: "complex", multiValued: true, mutability: "readOnly", subAttributes: [
          { name: "value", type: "string" },
          { name: "display", type: "string" },
        ]},
      ],
      meta: { resourceType: "Schema", location: "/scim/v2/Schemas/urn:ietf:params:scim:schemas:core:2.0:User" },
    },
    {
      id: "urn:ietf:params:scim:schemas:core:2.0:Group",
      name: "Group",
      description: "Group (maps to ZeroAuth Role)",
      schemas: ["urn:ietf:params:scim:meta:schemas:Group"],
      attributes: [
        { name: "displayName", type: "string", required: true },
        { name: "externalId", type: "string" },
        { name: "members", type: "complex", multiValued: true, subAttributes: [
          { name: "value", type: "string" },
          { name: "display", type: "string" },
        ]},
      ],
      meta: { resourceType: "Schema", location: "/scim/v2/Schemas/urn:ietf:params:scim:schemas:core:2.0:Group" },
    },
  ]);
});

// ─── GET /Users ───────────────────────────────────────────────────────────────

router.get("/Users", async (req: Request, res: Response): Promise<void> => {
  try {
    const baseUrl = getBaseUrl(req);
    const startIndex = Math.max(1, parseInt((req.query.startIndex as string) ?? "1", 10));
    const count = Math.min(200, Math.max(1, parseInt((req.query.count as string) ?? "100", 10)));
    const filterStr = req.query.filter as string | undefined;

    const mongoFilter: Record<string, unknown> = {};

    if (filterStr) {
      const parsed = parseSCIMFilter(filterStr);
      if (parsed) {
        if (parsed.attribute === "userName" && parsed.operator === "eq") {
          mongoFilter.email = parsed.value;
        } else if (parsed.attribute === "externalId" && parsed.operator === "eq") {
          mongoFilter["metadata.scimExternalId"] = parsed.value;
        }
      }
    }

    const skip = startIndex - 1;
    const [users, totalResults] = await Promise.all([
      UserModel.find(mongoFilter).skip(skip).limit(count).lean(),
      UserModel.countDocuments(mongoFilter),
    ]);

    const response: SCIMListResponse<SCIMUser> = {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults,
      startIndex,
      itemsPerPage: users.length,
      Resources: users.map((u) => userToSCIM(u, baseUrl)),
    };

    res.json(response);
  } catch (err) {
    res.status(500).json(scimError(500, "Failed to list users"));
  }
});

// ─── POST /Users ──────────────────────────────────────────────────────────────

router.post("/Users", async (req: Request, res: Response): Promise<void> => {
  try {
    const baseUrl = getBaseUrl(req);
    const scimUser: SCIMUser = req.body;

    if (!scimUser.userName) {
      res.status(400).json(scimError(400, "userName is required", "invalidValue"));
      return;
    }

    const fields = scimToUserFields(scimUser);
    const email = fields.email ?? scimUser.userName;

    const existing = await UserModel.findOne({ email });
    if (existing) {
      res.status(409).json(scimError(409, `User with userName '${scimUser.userName}' already exists`, "uniqueness"));
      return;
    }

    const displayName =
      (fields as any).displayName ??
      [scimUser.name?.givenName, scimUser.name?.familyName].filter(Boolean).join(" ") ||
      scimUser.userName;

    const userData: Record<string, unknown> = {
      email,
      displayName,
      status: scimUser.active === false ? "suspended" : "active",
    };

    if (fields.phone) userData.phone = fields.phone;

    if (scimUser.externalId) {
      userData.metadata = { scimExternalId: scimUser.externalId };
    }

    const user = await UserModel.create(userData);
    const scimResponse = userToSCIM(user, baseUrl);

    res.setHeader("Location", scimResponse.meta?.location ?? "");
    res.status(201).json(scimResponse);
  } catch (err) {
    res.status(500).json(scimError(500, "Failed to provision user"));
  }
});

// ─── GET /Users/:id ───────────────────────────────────────────────────────────

router.get("/Users/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const baseUrl = getBaseUrl(req);
    const user = await UserModel.findById(req.params.id).lean();
    if (!user) {
      res.status(404).json(scimError(404, "User not found"));
      return;
    }
    res.json(userToSCIM(user, baseUrl));
  } catch (err) {
    res.status(500).json(scimError(500, "Failed to get user"));
  }
});

// ─── PUT /Users/:id ───────────────────────────────────────────────────────────

router.put("/Users/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const baseUrl = getBaseUrl(req);
    const scimUser: SCIMUser = req.body;
    const fields = scimToUserFields(scimUser);

    const update: Record<string, unknown> = {};
    const email = fields.email ?? scimUser.userName;
    if (email) update.email = email;
    if ((fields as any).displayName) update.displayName = (fields as any).displayName;
    if (fields.phone) update.phone = fields.phone;
    if (fields.active !== undefined) update.status = fields.active ? "active" : "suspended";
    if (scimUser.externalId) update["metadata.scimExternalId"] = scimUser.externalId;

    const user = await UserModel.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    ).lean();

    if (!user) {
      res.status(404).json(scimError(404, "User not found"));
      return;
    }

    res.json(userToSCIM(user, baseUrl));
  } catch (err) {
    res.status(500).json(scimError(500, "Failed to replace user"));
  }
});

// ─── PATCH /Users/:id ────────────────────────────────────────────────────────

router.patch("/Users/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const baseUrl = getBaseUrl(req);
    const { Operations } = req.body as {
      schemas?: string[];
      Operations?: Array<{ op: string; path?: string; value?: unknown }>;
    };

    if (!Array.isArray(Operations)) {
      res.status(400).json(scimError(400, "Operations array is required", "invalidValue"));
      return;
    }

    const update: Record<string, unknown> = {};

    for (const op of Operations) {
      const operation = op.op?.toLowerCase();
      if (operation !== "replace" && operation !== "add") continue;

      const path = op.path;
      const value = op.value;

      if (!path && typeof value === "object" && value !== null) {
        // Whole-object replace/add
        const obj = value as Record<string, unknown>;
        if (obj.active !== undefined) update.status = obj.active ? "active" : "suspended";
        if (obj.userName) update.email = obj.userName;
        if (typeof obj.name === "object" && obj.name) {
          const name = obj.name as Record<string, string>;
          const parts = [name.givenName, name.familyName].filter(Boolean);
          if (parts.length) update.displayName = parts.join(" ");
          else if (name.formatted) update.displayName = name.formatted;
        }
        if (Array.isArray(obj.emails)) {
          const primary = (obj.emails as Array<{ value: string; primary?: boolean }>).find(
            (e) => e.primary
          );
          if (primary) update.email = primary.value;
        }
        if (Array.isArray(obj.phoneNumbers)) {
          const phone = (obj.phoneNumbers as Array<{ value: string }>)[0];
          if (phone) update.phone = phone.value;
        }
      } else if (path === "active") {
        update.status = value ? "active" : "suspended";
      } else if (path === "userName") {
        update.email = value;
      } else if (path === "name.givenName" || path === "name.familyName") {
        // Will reconcile below
        (update as any)[`__name__${path.split(".")[1]}`] = value;
      } else if (path === "emails[type eq \"work\"].value" || path === "emails") {
        if (typeof value === "string") update.email = value;
        else if (Array.isArray(value)) {
          const primary = (value as Array<{ value: string; primary?: boolean }>).find(
            (e) => e.primary
          );
          if (primary) update.email = primary.value;
        }
      } else if (path === "phoneNumbers[type eq \"work\"].value" || path === "phoneNumbers") {
        if (typeof value === "string") update.phone = value;
        else if (Array.isArray(value)) {
          update.phone = (value as Array<{ value: string }>)[0]?.value;
        }
      }
    }

    // Reconcile name parts if set individually
    const givenName = (update as any).__name__givenName;
    const familyName = (update as any).__name__familyName;
    if (givenName !== undefined || familyName !== undefined) {
      // Fetch current user to merge
      const current = await UserModel.findById(req.params.id).lean();
      if (current) {
        const currentParts = (current.displayName ?? "").split(/\s+/);
        const g = givenName ?? currentParts[0] ?? "";
        const f = familyName ?? (currentParts.length > 1 ? currentParts.slice(1).join(" ") : "");
        update.displayName = [g, f].filter(Boolean).join(" ") || current.displayName;
      }
      delete (update as any).__name__givenName;
      delete (update as any).__name__familyName;
    }

    const user = await UserModel.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    ).lean();

    if (!user) {
      res.status(404).json(scimError(404, "User not found"));
      return;
    }

    res.json(userToSCIM(user, baseUrl));
  } catch (err) {
    res.status(500).json(scimError(500, "Failed to patch user"));
  }
});

// ─── DELETE /Users/:id ────────────────────────────────────────────────────────

router.delete("/Users/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const user = await UserModel.findByIdAndUpdate(
      req.params.id,
      { $set: { status: "suspended" } },
      { new: true }
    );

    if (!user) {
      res.status(404).json(scimError(404, "User not found"));
      return;
    }

    res.status(204).send();
  } catch (err) {
    res.status(500).json(scimError(500, "Failed to de-provision user"));
  }
});

// ─── GET /Groups ──────────────────────────────────────────────────────────────

router.get("/Groups", async (req: Request, res: Response): Promise<void> => {
  try {
    const startIndex = Math.max(1, parseInt((req.query.startIndex as string) ?? "1", 10));
    const count = Math.min(200, Math.max(1, parseInt((req.query.count as string) ?? "100", 10)));
    const filterStr = req.query.filter as string | undefined;

    const mongoFilter: Record<string, unknown> = {};
    if (filterStr) {
      const parsed = parseSCIMFilter(filterStr);
      if (parsed && parsed.attribute === "displayName" && parsed.operator === "eq") {
        mongoFilter.displayName = parsed.value;
      }
    }

    const skip = startIndex - 1;
    const [roles, totalResults] = await Promise.all([
      RoleModel.find(mongoFilter).skip(skip).limit(count).lean(),
      RoleModel.countDocuments(mongoFilter),
    ]);

    const resources: SCIMGroup[] = roles.map((role) => ({
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
      id: String(role._id),
      displayName: role.displayName ?? role.name,
      meta: {
        resourceType: "Group",
        created: role.createdAt ? new Date(role.createdAt as Date).toISOString() : undefined,
        lastModified: role.updatedAt ? new Date(role.updatedAt as Date).toISOString() : undefined,
      },
    }));

    const response: SCIMListResponse<SCIMGroup> = {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
      totalResults,
      startIndex,
      itemsPerPage: resources.length,
      Resources: resources,
    };

    res.json(response);
  } catch (err) {
    res.status(500).json(scimError(500, "Failed to list groups"));
  }
});

// ─── POST /Groups ─────────────────────────────────────────────────────────────

router.post("/Groups", async (req: Request, res: Response): Promise<void> => {
  try {
    const scimGroup: SCIMGroup = req.body;

    if (!scimGroup.displayName) {
      res.status(400).json(scimError(400, "displayName is required", "invalidValue"));
      return;
    }

    const name = scimGroup.displayName.toLowerCase().replace(/\s+/g, "_");

    const role = await RoleModel.create({
      name,
      displayName: scimGroup.displayName,
      description: `SCIM-provisioned group: ${scimGroup.displayName}`,
      permissions: [],
    });

    const scimResponse: SCIMGroup = {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
      id: String(role._id),
      displayName: role.displayName,
      meta: {
        resourceType: "Group",
        created: new Date(role.createdAt as Date).toISOString(),
        lastModified: new Date(role.updatedAt as Date).toISOString(),
      },
    };

    res.status(201).json(scimResponse);
  } catch (err) {
    res.status(500).json(scimError(500, "Failed to create group"));
  }
});

// ─── GET /Groups/:id ──────────────────────────────────────────────────────────

router.get("/Groups/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const role = await RoleModel.findById(req.params.id).lean();
    if (!role) {
      res.status(404).json(scimError(404, "Group not found"));
      return;
    }

    const scimResponse: SCIMGroup = {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
      id: String(role._id),
      displayName: role.displayName ?? role.name,
      meta: {
        resourceType: "Group",
        created: role.createdAt ? new Date(role.createdAt as Date).toISOString() : undefined,
        lastModified: role.updatedAt ? new Date(role.updatedAt as Date).toISOString() : undefined,
      },
    };

    res.json(scimResponse);
  } catch (err) {
    res.status(500).json(scimError(500, "Failed to get group"));
  }
});

// ─── PUT /Groups/:id ──────────────────────────────────────────────────────────

router.put("/Groups/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const scimGroup: SCIMGroup = req.body;

    const update: Record<string, unknown> = {};
    if (scimGroup.displayName) update.displayName = scimGroup.displayName;
    if (scimGroup.members) {
      // members are not stored on RoleModel, acknowledge but ignore
    }

    const role = await RoleModel.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true, runValidators: true }
    ).lean();

    if (!role) {
      res.status(404).json(scimError(404, "Group not found"));
      return;
    }

    const scimResponse: SCIMGroup = {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
      id: String(role._id),
      displayName: role.displayName ?? role.name,
      meta: {
        resourceType: "Group",
        lastModified: role.updatedAt ? new Date(role.updatedAt as Date).toISOString() : undefined,
      },
    };

    res.json(scimResponse);
  } catch (err) {
    res.status(500).json(scimError(500, "Failed to replace group"));
  }
});

// ─── PATCH /Groups/:id ───────────────────────────────────────────────────────

router.patch("/Groups/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { Operations } = req.body as {
      Operations?: Array<{ op: string; path?: string; value?: unknown }>;
    };

    if (!Array.isArray(Operations)) {
      res.status(400).json(scimError(400, "Operations array is required", "invalidValue"));
      return;
    }

    const update: Record<string, unknown> = {};

    for (const op of Operations) {
      const operation = op.op?.toLowerCase();
      if (operation === "replace" || operation === "add") {
        if (op.path === "displayName") {
          update.displayName = op.value;
        } else if (!op.path && typeof op.value === "object" && op.value !== null) {
          const obj = op.value as Record<string, unknown>;
          if (obj.displayName) update.displayName = obj.displayName;
        }
        // members patch is acknowledged but not stored (no member list on RoleModel)
      }
    }

    const role = await RoleModel.findByIdAndUpdate(
      req.params.id,
      { $set: update },
      { new: true }
    ).lean();

    if (!role) {
      res.status(404).json(scimError(404, "Group not found"));
      return;
    }

    const scimResponse: SCIMGroup = {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
      id: String(role._id),
      displayName: role.displayName ?? role.name,
      meta: {
        resourceType: "Group",
        lastModified: role.updatedAt ? new Date(role.updatedAt as Date).toISOString() : undefined,
      },
    };

    res.json(scimResponse);
  } catch (err) {
    res.status(500).json(scimError(500, "Failed to patch group"));
  }
});

// ─── DELETE /Groups/:id ───────────────────────────────────────────────────────

router.delete("/Groups/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const role = await RoleModel.findByIdAndDelete(req.params.id);
    if (!role) {
      res.status(404).json(scimError(404, "Group not found"));
      return;
    }
    res.status(204).send();
  } catch (err) {
    res.status(500).json(scimError(500, "Failed to delete group"));
  }
});

export default router;

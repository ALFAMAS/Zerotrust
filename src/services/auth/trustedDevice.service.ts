import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/index";
import { trustedDevicesTable } from "../../db/schema";
import { getLogger } from "../../logger/index";

const logger = getLogger("trusted-device");

export interface TrustedDevice {
  id: string;
  orgId: string;
  userId: string;
  deviceName: string;
  deviceFingerprint: string;
  registeredBy: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export async function listTrustedDevices(orgId: string): Promise<TrustedDevice[]> {
  const db = getDb();
  return db
    .select()
    .from(trustedDevicesTable)
    .where(eq(trustedDevicesTable.orgId, orgId))
    .orderBy(trustedDevicesTable.createdAt) as Promise<TrustedDevice[]>;
}

export async function registerTrustedDevice(input: {
  orgId: string;
  userId: string;
  deviceName: string;
  deviceFingerprint: string;
  registeredBy: string;
}): Promise<TrustedDevice> {
  const db = getDb();
  const [device] = await db
    .insert(trustedDevicesTable)
    .values({
      orgId: input.orgId,
      userId: input.userId,
      deviceName: input.deviceName,
      deviceFingerprint: input.deviceFingerprint,
      registeredBy: input.registeredBy,
    })
    .returning();
  logger.info("Trusted device registered", {
    orgId: input.orgId,
    userId: input.userId,
    deviceId: device.id,
  });
  return device as TrustedDevice;
}

export async function removeTrustedDevice(orgId: string, deviceId: string): Promise<boolean> {
  const db = getDb();
  const result = await db
    .delete(trustedDevicesTable)
    .where(and(eq(trustedDevicesTable.orgId, orgId), eq(trustedDevicesTable.id, deviceId)))
    .returning({ id: trustedDevicesTable.id });
  return result.length > 0;
}

export async function isDeviceTrusted(orgId: string, deviceFingerprint: string): Promise<boolean> {
  const db = getDb();
  const [device] = await db
    .select({ id: trustedDevicesTable.id })
    .from(trustedDevicesTable)
    .where(
      and(
        eq(trustedDevicesTable.orgId, orgId),
        eq(trustedDevicesTable.deviceFingerprint, deviceFingerprint)
      )
    )
    .limit(1);
  return !!device;
}

export async function updateLastUsed(orgId: string, deviceFingerprint: string): Promise<void> {
  const db = getDb();
  await db
    .update(trustedDevicesTable)
    .set({ lastUsedAt: new Date() })
    .where(
      and(
        eq(trustedDevicesTable.orgId, orgId),
        eq(trustedDevicesTable.deviceFingerprint, deviceFingerprint)
      )
    );
}

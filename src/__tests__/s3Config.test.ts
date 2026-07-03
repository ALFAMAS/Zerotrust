import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getS3Config, isS3BackupEnabled, s3RetentionDays } from "../shared/s3Config";

const ENV_KEYS = [
  "BACKUP_S3_ACCESS_KEY_ID",
  "BACKUP_S3_SECRET_ACCESS_KEY",
  "BACKUP_S3_BUCKET",
  "BACKUP_S3_ENDPOINT",
  "BACKUP_S3_REGION",
  "BACKUP_S3_PREFIX",
  "BACKUP_S3_FORCE_PATH_STYLE",
  "BACKUP_S3_RETENTION_DAYS",
  "BACKUP_RETENTION_DAYS",
] as const;

const originalEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
});

describe("s3Config", () => {
  it("returns null when required credentials are missing", () => {
    delete process.env.BACKUP_S3_ACCESS_KEY_ID;
    delete process.env.BACKUP_S3_SECRET_ACCESS_KEY;
    delete process.env.BACKUP_S3_BUCKET;
    expect(getS3Config()).toBeNull();
    expect(isS3BackupEnabled()).toBe(false);
  });

  it("reads S3 config from environment variables", () => {
    process.env.BACKUP_S3_ACCESS_KEY_ID = "key";
    process.env.BACKUP_S3_SECRET_ACCESS_KEY = "secret";
    process.env.BACKUP_S3_BUCKET = "bucket";
    process.env.BACKUP_S3_ENDPOINT = "https://s3.example.com";
    process.env.BACKUP_S3_REGION = "eu-west-1";
    process.env.BACKUP_S3_PREFIX = "dumps/";
    process.env.BACKUP_S3_FORCE_PATH_STYLE = "true";

    expect(isS3BackupEnabled()).toBe(true);
    expect(getS3Config()).toEqual({
      endpoint: "https://s3.example.com",
      region: "eu-west-1",
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucket: "bucket",
      prefix: "dumps/",
      forcePathStyle: true,
    });
  });

  it("s3RetentionDays prefers BACKUP_S3_RETENTION_DAYS then BACKUP_RETENTION_DAYS", () => {
    delete process.env.BACKUP_S3_RETENTION_DAYS;
    delete process.env.BACKUP_RETENTION_DAYS;
    expect(s3RetentionDays()).toBe(30);

    process.env.BACKUP_RETENTION_DAYS = "14";
    expect(s3RetentionDays()).toBe(14);

    process.env.BACKUP_S3_RETENTION_DAYS = "7";
    expect(s3RetentionDays()).toBe(7);
  });
});

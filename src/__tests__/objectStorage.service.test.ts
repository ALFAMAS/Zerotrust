import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ── AWS SDK v3 mocks ────────────────────────────────────────────────────────
// The S3Client is a class; we mock the module so we never instantiate a real
// client (which would need credentials + network).

const sendMock = vi.fn();
vi.mock("@aws-sdk/client-s3", () => {
  // Everything here is invoked via `new`. Vitest 4 only honours a constructor's
  // instance (`this`) when the mock implementation is a `function`/`class`, not
  // an arrow — so build constructable mocks. Commands expose `__type` + `input`
  // for assertions; the client exposes `send`.
  const command = (type: string) =>
    vi.fn(function (this: { __type: string; input: unknown }, input: unknown) {
      this.__type = type;
      this.input = input;
    });
  const S3Client = vi.fn(function (this: { send: typeof sendMock }) {
    this.send = sendMock;
  });
  return {
    S3Client,
    PutObjectCommand: command("PutObject"),
    DeleteObjectCommand: command("DeleteObject"),
    DeleteObjectsCommand: command("DeleteObjects"),
    ListObjectsV2Command: command("ListObjectsV2"),
    HeadBucketCommand: command("HeadBucket"),
  };
});

vi.mock("../logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  getS3Config,
  isS3BackupEnabled,
  s3RetentionDays,
  pingS3,
  pingS3WithTimeout,
  uploadFile,
  uploadBuffer,
  publicURLForKey,
  parseObjectKeyFromPublicUrl,
  listObjects,
  deleteObject,
  pruneOldBackups,
  cdnURLForKey,
  getUploadCacheControl,
  uploadCdnBaseUrl,
} from "../services/ops/objectStorage.service";

// ── Env helpers ─────────────────────────────────────────────────────────────

function setEnv(overrides: Record<string, string | undefined>) {
  const keys = [
    "BACKUP_S3_ENDPOINT",
    "BACKUP_S3_REGION",
    "BACKUP_S3_ACCESS_KEY_ID",
    "BACKUP_S3_SECRET_ACCESS_KEY",
    "BACKUP_S3_BUCKET",
    "BACKUP_S3_PREFIX",
    "BACKUP_S3_FORCE_PATH_STYLE",
    "BACKUP_S3_RETENTION_DAYS",
    "BACKUP_S3_PUBLIC_URL_TEMPLATE",
    "UPLOADS_S3_PREFIX",
    "BACKUP_RETENTION_DAYS",
    "UPLOADS_CDN_URL",
    "UPLOADS_CACHE_CONTROL",
  ];
  const saved: Record<string, string | undefined> = {};
  for (const k of keys) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return () => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };
}

let tmpDir: string;

beforeEach(() => {
  sendMock.mockReset();
  tmpDir = mkdtempSync(join(tmpdir(), "objstore-"));
});

afterEach(() => {
  // uploadFile() hands a lazily-opened read stream to the (mocked) S3 client,
  // which never consumes it. Destroy any such stream — with a no-op error
  // handler — before removing the temp dir, so a late open() can't raise an
  // uncaught ENOENT against the just-deleted file.
  for (const call of sendMock.mock.calls) {
    const body = (call?.[0] as { input?: { Body?: unknown } })?.input?.Body as
      | { destroy?: () => void; on?: (event: string, cb: () => void) => void }
      | undefined;
    if (body && typeof body.destroy === "function") {
      body.on?.("error", () => {});
      body.destroy();
    }
  }
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Config parsing ──────────────────────────────────────────────────────────

describe("getS3Config / isS3BackupEnabled", () => {
  it("returns null when env vars are missing", () => {
    const restore = setEnv({});
    try {
      expect(getS3Config()).toBeNull();
      expect(isS3BackupEnabled()).toBe(false);
    } finally {
      restore();
    }
  });

  it("returns config when required vars are set", () => {
    const restore = setEnv({
      BACKUP_S3_ACCESS_KEY_ID: "key-123",
      BACKUP_S3_SECRET_ACCESS_KEY: "secret-abc",
      BACKUP_S3_BUCKET: "my-bucket",
      BACKUP_S3_ENDPOINT: "https://s3.eu-central-003.backblazeb2.com",
      BACKUP_S3_REGION: "eu-central-003",
      BACKUP_S3_PREFIX: "backups/",
      BACKUP_S3_FORCE_PATH_STYLE: "true",
    });
    try {
      const cfg = getS3Config();
      expect(cfg).not.toBeNull();
      expect(cfg!.bucket).toBe("my-bucket");
      expect(cfg!.endpoint).toBe("https://s3.eu-central-003.backblazeb2.com");
      expect(cfg!.region).toBe("eu-central-003");
      expect(cfg!.prefix).toBe("backups/");
      expect(cfg!.forcePathStyle).toBe(true);
    } finally {
      restore();
    }
  });

  it("defaults region to us-east-1 when missing", () => {
    const restore = setEnv({
      BACKUP_S3_ACCESS_KEY_ID: "k",
      BACKUP_S3_SECRET_ACCESS_KEY: "s",
      BACKUP_S3_BUCKET: "b",
    });
    try {
      expect(getS3Config()!.region).toBe("us-east-1");
    } finally {
      restore();
    }
  });

  it("defaults prefix to backups/ when missing", () => {
    const restore = setEnv({
      BACKUP_S3_ACCESS_KEY_ID: "k",
      BACKUP_S3_SECRET_ACCESS_KEY: "s",
      BACKUP_S3_BUCKET: "b",
    });
    try {
      expect(getS3Config()!.prefix).toBe("backups/");
    } finally {
      restore();
    }
  });

  it("defaults forcePathStyle to false (AWS default) when missing", () => {
    const restore = setEnv({
      BACKUP_S3_ACCESS_KEY_ID: "k",
      BACKUP_S3_SECRET_ACCESS_KEY: "s",
      BACKUP_S3_BUCKET: "b",
    });
    try {
      expect(getS3Config()!.forcePathStyle).toBe(false);
    } finally {
      restore();
    }
  });

  it("requires all three: access key, secret, bucket", () => {
    const restore = setEnv({
      BACKUP_S3_ACCESS_KEY_ID: "k",
      BACKUP_S3_BUCKET: "b",
      // no secret
    });
    try {
      expect(getS3Config()).toBeNull();
    } finally {
      restore();
    }
  });
});

// ── Retention ───────────────────────────────────────────────────────────────

describe("s3RetentionDays", () => {
  it("prefers BACKUP_S3_RETENTION_DAYS", () => {
    const restore = setEnv({
      BACKUP_S3_RETENTION_DAYS: "60",
      BACKUP_RETENTION_DAYS: "30",
    });
    try {
      expect(s3RetentionDays()).toBe(60);
    } finally {
      restore();
    }
  });

  it("falls back to BACKUP_RETENTION_DAYS", () => {
    const restore = setEnv({
      BACKUP_RETENTION_DAYS: "14",
    });
    try {
      expect(s3RetentionDays()).toBe(14);
    } finally {
      restore();
    }
  });

  it("defaults to 30", () => {
    const restore = setEnv({});
    try {
      expect(s3RetentionDays()).toBe(30);
    } finally {
      restore();
    }
  });
});

// ── pingS3 ──────────────────────────────────────────────────────────────────

describe("pingS3", () => {
  it("returns ok when HeadBucket succeeds", async () => {
    const restore = setEnv({
      BACKUP_S3_ACCESS_KEY_ID: "k",
      BACKUP_S3_SECRET_ACCESS_KEY: "s",
      BACKUP_S3_BUCKET: "b",
    });
    sendMock.mockResolvedValueOnce({});
    try {
      const res = await pingS3();
      expect(res.ok).toBe(true);
    } finally {
      restore();
    }
  });

  it("returns the error when HeadBucket throws", async () => {
    const restore = setEnv({
      BACKUP_S3_ACCESS_KEY_ID: "k",
      BACKUP_S3_SECRET_ACCESS_KEY: "s",
      BACKUP_S3_BUCKET: "b",
    });
    sendMock.mockRejectedValueOnce(new Error("403 Forbidden"));
    try {
      const res = await pingS3();
      expect(res.ok).toBe(false);
      expect(res.error).toContain("403");
    } finally {
      restore();
    }
  });

  it("returns not-configured when env vars are missing", async () => {
    const restore = setEnv({});
    try {
      const res = await pingS3();
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/not configured/);
    } finally {
      restore();
    }
  });
});

// ── pingS3WithTimeout ───────────────────────────────────────────────────────

describe("pingS3WithTimeout", () => {
  it("returns the same result as pingS3 on success", async () => {
    const restore = setEnv({
      BACKUP_S3_ACCESS_KEY_ID: "k",
      BACKUP_S3_SECRET_ACCESS_KEY: "s",
      BACKUP_S3_BUCKET: "b",
    });
    sendMock.mockResolvedValueOnce({});
    try {
      const res = await pingS3WithTimeout(4000);
      expect(res.ok).toBe(true);
    } finally {
      restore();
    }
  });

  it("returns the same {ok:false, error} on failure", async () => {
    const restore = setEnv({
      BACKUP_S3_ACCESS_KEY_ID: "k",
      BACKUP_S3_SECRET_ACCESS_KEY: "s",
      BACKUP_S3_BUCKET: "b",
    });
    sendMock.mockRejectedValueOnce(new Error("403 Forbidden"));
    try {
      const res = await pingS3WithTimeout(4000);
      expect(res.ok).toBe(false);
      expect(res.error).toContain("403");
    } finally {
      restore();
    }
  });

  it("rejects with a timeout error when the underlying call hangs", async () => {
    const restore = setEnv({
      BACKUP_S3_ACCESS_KEY_ID: "k",
      BACKUP_S3_SECRET_ACCESS_KEY: "s",
      BACKUP_S3_BUCKET: "b",
    });
    // Hang forever — never resolves.
    sendMock.mockImplementationOnce(() => new Promise(() => {}));
    try {
      await expect(pingS3WithTimeout(50)).rejects.toThrow(/timed out/);
    } finally {
      restore();
    }
  });

  it("does not leak the timer after a successful response", async () => {
    const restore = setEnv({
      BACKUP_S3_ACCESS_KEY_ID: "k",
      BACKUP_S3_SECRET_ACCESS_KEY: "s",
      BACKUP_S3_BUCKET: "b",
    });
    sendMock.mockResolvedValueOnce({});
    try {
      const clearTimeoutSpy = vi.spyOn(global, "clearTimeout");
      await pingS3WithTimeout(1000);
      expect(clearTimeoutSpy).toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});

// ── uploadFile ─────────────────────────────────────────────────────────────

describe("uploadFile", () => {
  it("streams the file to the configured bucket + prefix", async () => {
    const restore = setEnv({
      BACKUP_S3_ACCESS_KEY_ID: "k",
      BACKUP_S3_SECRET_ACCESS_KEY: "s",
      BACKUP_S3_BUCKET: "b",
      BACKUP_S3_PREFIX: "backups/",
    });
    sendMock.mockResolvedValueOnce({});
    const file = join(tmpDir, "zerotrust-2026.dump");
    writeFileSync(file, "fake-dump-content");
    try {
      const res = await uploadFile(file, "zerotrust-2026.dump");
      expect(res.key).toBe("backups/zerotrust-2026.dump");
      expect(res.size).toBeGreaterThan(0);
      expect(sendMock).toHaveBeenCalledTimes(1);
      const cmd = sendMock.mock.calls[0][0];
      expect(cmd.__type).toBe("PutObject");
      expect(cmd.input.Bucket).toBe("b");
      expect(cmd.input.Key).toBe("backups/zerotrust-2026.dump");
    } finally {
      restore();
    }
  });

  it("normalises a non-trailing-slash prefix", async () => {
    const restore = setEnv({
      BACKUP_S3_ACCESS_KEY_ID: "k",
      BACKUP_S3_SECRET_ACCESS_KEY: "s",
      BACKUP_S3_BUCKET: "b",
      BACKUP_S3_PREFIX: "backups",
    });
    sendMock.mockResolvedValueOnce({});
    const file = join(tmpDir, "x.dump");
    writeFileSync(file, "x");
    try {
      const res = await uploadFile(file, "x.dump");
      expect(res.key).toBe("backups/x.dump");
    } finally {
      restore();
    }
  });

  it("throws when S3 is not configured", async () => {
    const restore = setEnv({});
    const file = join(tmpDir, "x.dump");
    writeFileSync(file, "x");
    try {
      await expect(uploadFile(file, "x.dump")).rejects.toThrow(
        /not configured/,
      );
    } finally {
      restore();
    }
  });
});

// ── listObjects ─────────────────────────────────────────────────────────────

describe("listObjects", () => {
  it("returns parsed S3Object[] with key, size, lastModified", async () => {
    const restore = setEnv({
      BACKUP_S3_ACCESS_KEY_ID: "k",
      BACKUP_S3_SECRET_ACCESS_KEY: "s",
      BACKUP_S3_BUCKET: "b",
    });
    sendMock.mockResolvedValueOnce({
      Contents: [
        {
          Key: "backups/a.dump",
          Size: 1024,
          LastModified: new Date("2026-06-01T00:00:00Z"),
        },
        {
          Key: "backups/b.dump",
          Size: 2048,
          LastModified: new Date("2026-06-02T00:00:00Z"),
        },
      ],
    });
    try {
      const list = await listObjects();
      expect(list).toHaveLength(2);
      expect(list[0].key).toBe("backups/a.dump");
      expect(list[0].size).toBe(1024);
    } finally {
      restore();
    }
  });

  it("paginates via NextContinuationToken", async () => {
    const restore = setEnv({
      BACKUP_S3_ACCESS_KEY_ID: "k",
      BACKUP_S3_SECRET_ACCESS_KEY: "s",
      BACKUP_S3_BUCKET: "b",
    });
    sendMock
      .mockResolvedValueOnce({
        Contents: [
          { Key: "backups/a.dump", Size: 1, LastModified: new Date() },
        ],
        NextContinuationToken: "page-2",
      })
      .mockResolvedValueOnce({
        Contents: [
          { Key: "backups/b.dump", Size: 2, LastModified: new Date() },
        ],
      });
    try {
      const list = await listObjects();
      expect(list).toHaveLength(2);
      expect(sendMock).toHaveBeenCalledTimes(2);
      const secondCall = sendMock.mock.calls[1][0];
      expect(secondCall.input.ContinuationToken).toBe("page-2");
    } finally {
      restore();
    }
  });

  it("returns empty array when bucket has no contents", async () => {
    const restore = setEnv({
      BACKUP_S3_ACCESS_KEY_ID: "k",
      BACKUP_S3_SECRET_ACCESS_KEY: "s",
      BACKUP_S3_BUCKET: "b",
    });
    sendMock.mockResolvedValueOnce({ Contents: undefined });
    try {
      const list = await listObjects();
      expect(list).toEqual([]);
    } finally {
      restore();
    }
  });
});

// ── deleteObject ────────────────────────────────────────────────────────────

describe("deleteObject", () => {
  it("sends a DeleteObject command with the full key", async () => {
    const restore = setEnv({
      BACKUP_S3_ACCESS_KEY_ID: "k",
      BACKUP_S3_SECRET_ACCESS_KEY: "s",
      BACKUP_S3_BUCKET: "b",
    });
    sendMock.mockResolvedValueOnce({});
    try {
      await deleteObject("backups/old.dump");
      expect(sendMock).toHaveBeenCalledTimes(1);
      const cmd = sendMock.mock.calls[0][0];
      expect(cmd.__type).toBe("DeleteObject");
      expect(cmd.input.Key).toBe("backups/old.dump");
    } finally {
      restore();
    }
  });
});

// ── pruneOldBackups ─────────────────────────────────────────────────────────

describe("pruneOldBackups", () => {
  it("deletes objects older than the cutoff and returns their keys", async () => {
    const restore = setEnv({
      BACKUP_S3_ACCESS_KEY_ID: "k",
      BACKUP_S3_SECRET_ACCESS_KEY: "s",
      BACKUP_S3_BUCKET: "b",
    });
    const now = Date.now();
    const old = new Date(now - 100 * 86400_000); // 100 days ago
    const recent = new Date(now - 5 * 86400_000); // 5 days ago
    sendMock.mockResolvedValueOnce({
      Contents: [
        { Key: "backups/old.dump", Size: 100, LastModified: old },
        { Key: "backups/recent.dump", Size: 100, LastModified: recent },
      ],
    });
    sendMock.mockResolvedValueOnce({}); // DeleteObjects response
    try {
      const pruned = await pruneOldBackups(30);
      expect(pruned).toEqual(["backups/old.dump"]);
      const cmd = sendMock.mock.calls[1][0];
      expect(cmd.__type).toBe("DeleteObjects");
      expect(cmd.input.Delete.Objects).toHaveLength(1);
      expect(cmd.input.Delete.Objects[0].Key).toBe("backups/old.dump");
    } finally {
      restore();
    }
  });

  it("returns empty array when nothing is stale", async () => {
    const restore = setEnv({
      BACKUP_S3_ACCESS_KEY_ID: "k",
      BACKUP_S3_SECRET_ACCESS_KEY: "s",
      BACKUP_S3_BUCKET: "b",
    });
    sendMock.mockResolvedValueOnce({
      Contents: [
        { Key: "backups/recent.dump", Size: 100, LastModified: new Date() },
      ],
    });
    try {
      const pruned = await pruneOldBackups(30);
      expect(pruned).toEqual([]);
      expect(sendMock).toHaveBeenCalledTimes(1); // only the list, no delete
    } finally {
      restore();
    }
  });

  it("batches deletes for >1000 stale objects", async () => {
    const restore = setEnv({
      BACKUP_S3_ACCESS_KEY_ID: "k",
      BACKUP_S3_SECRET_ACCESS_KEY: "s",
      BACKUP_S3_BUCKET: "b",
    });
    const old = new Date(Date.now() - 100 * 86400_000);
    // Build 1500 stale + 500 fresh — only the 1500 should be deleted, in 2 batches.
    const contents = [
      ...Array.from({ length: 1500 }, (_, i) => ({
        Key: `backups/old-${i}.dump`,
        Size: 1,
        LastModified: old,
      })),
      ...Array.from({ length: 500 }, (_, i) => ({
        Key: `backups/recent-${i}.dump`,
        Size: 1,
        LastModified: new Date(),
      })),
    ];
    sendMock.mockResolvedValueOnce({ Contents: contents });
    sendMock.mockResolvedValueOnce({}); // batch 1
    sendMock.mockResolvedValueOnce({}); // batch 2
    try {
      const pruned = await pruneOldBackups(30);
      expect(pruned).toHaveLength(1500);
      // 1 list + 2 batch deletes = 3 sends total.
      expect(sendMock).toHaveBeenCalledTimes(3);
      const batch1 = sendMock.mock.calls[1][0];
      const batch2 = sendMock.mock.calls[2][0];
      expect(batch1.input.Delete.Objects).toHaveLength(1000);
      expect(batch2.input.Delete.Objects).toHaveLength(500);
    } finally {
      restore();
    }
  });
});

// ── uploadBuffer ────────────────────────────────────────────────────────────

describe("uploadBuffer", () => {
  it("uploads under the UPLOADS_S3_PREFIX and returns a public URL", async () => {
    const restore = setEnv({
      BACKUP_S3_ACCESS_KEY_ID: "k",
      BACKUP_S3_SECRET_ACCESS_KEY: "s",
      BACKUP_S3_BUCKET: "my-bucket",
      BACKUP_S3_ENDPOINT: "https://s3.eu-central-003.backblazeb2.com",
      BACKUP_S3_FORCE_PATH_STYLE: "true",
      UPLOADS_S3_PREFIX: "uploads/",
    });
    sendMock.mockResolvedValueOnce({});
    try {
      const result = await uploadBuffer({
        key: "avatars/u1-1.jpg",
        body: Buffer.from("binary-data"),
        contentType: "image/jpeg",
      });
      expect(result.key).toBe("uploads/avatars/u1-1.jpg");
      expect(result.size).toBe("binary-data".length);
      expect(result.url).toBe(
        "https://s3.eu-central-003.backblazeb2.com/my-bucket/uploads/avatars/u1-1.jpg",
      );
      const cmd = sendMock.mock.calls[0][0];
      expect(cmd.__type).toBe("PutObject");
      expect(cmd.input.Bucket).toBe("my-bucket");
      expect(cmd.input.Key).toBe("uploads/avatars/u1-1.jpg");
      expect(cmd.input.ContentType).toBe("image/jpeg");
      // Stamped with the default long-lived immutable Cache-Control for the edge.
      expect(cmd.input.CacheControl).toBe(
        "public, max-age=31536000, immutable",
      );
    } finally {
      restore();
    }
  });

  it("stamps an explicit cacheControl override on the PutObject", async () => {
    const restore = setEnv({
      BACKUP_S3_ACCESS_KEY_ID: "k",
      BACKUP_S3_SECRET_ACCESS_KEY: "s",
      BACKUP_S3_BUCKET: "b",
      BACKUP_S3_ENDPOINT: "https://example.com",
      BACKUP_S3_FORCE_PATH_STYLE: "true",
    });
    sendMock.mockResolvedValueOnce({});
    try {
      await uploadBuffer({
        key: "f.bin",
        body: Buffer.from("x"),
        contentType: "application/octet-stream",
        cacheControl: "private, no-store",
      });
      expect(sendMock.mock.calls[0][0].input.CacheControl).toBe(
        "private, no-store",
      );
    } finally {
      restore();
    }
  });

  it("returns the dedicated UPLOADS_CDN_URL delivery URL when configured", async () => {
    const restore = setEnv({
      BACKUP_S3_ACCESS_KEY_ID: "k",
      BACKUP_S3_SECRET_ACCESS_KEY: "s",
      BACKUP_S3_BUCKET: "b",
      BACKUP_S3_ENDPOINT: "https://s3.eu-central-003.backblazeb2.com",
      BACKUP_S3_FORCE_PATH_STYLE: "true",
      UPLOADS_CDN_URL: "https://cdn.zerotrust.app/",
    });
    sendMock.mockResolvedValueOnce({});
    try {
      const result = await uploadBuffer({
        key: "avatars/u1-1.jpg",
        body: Buffer.from("x"),
        contentType: "image/jpeg",
      });
      // CDN host + path, not the origin bucket host; trailing slash trimmed.
      expect(result.url).toBe(
        "https://cdn.zerotrust.app/uploads/avatars/u1-1.jpg",
      );
    } finally {
      restore();
    }
  });

  it("uses the default uploads/ prefix when UPLOADS_S3_PREFIX is unset", async () => {
    const restore = setEnv({
      BACKUP_S3_ACCESS_KEY_ID: "k",
      BACKUP_S3_SECRET_ACCESS_KEY: "s",
      BACKUP_S3_BUCKET: "b",
      BACKUP_S3_ENDPOINT: "https://example.com",
      BACKUP_S3_FORCE_PATH_STYLE: "true",
    });
    sendMock.mockResolvedValueOnce({});
    try {
      const result = await uploadBuffer({
        key: "file.bin",
        body: Buffer.from("x"),
        contentType: "application/octet-stream",
      });
      expect(result.key).toBe("uploads/file.bin");
    } finally {
      restore();
    }
  });

  it("throws when S3 is not configured", async () => {
    const restore = setEnv({});
    try {
      await expect(
        uploadBuffer({
          key: "x",
          body: Buffer.from("x"),
          contentType: "text/plain",
        }),
      ).rejects.toThrow(/not configured/);
    } finally {
      restore();
    }
  });
});

// ── publicURLForKey ─────────────────────────────────────────────────────────

describe("publicURLForKey", () => {
  it("returns a path-style URL when an endpoint is set (B2/R2/MinIO)", () => {
    const cfg = {
      endpoint: "https://s3.eu-central-003.backblazeb2.com",
      region: "eu-central-003",
      accessKeyId: "k",
      secretAccessKey: "s",
      bucket: "my-bucket",
      prefix: "backups/",
      forcePathStyle: true,
    };
    const url = publicURLForKey(cfg, "uploads/avatars/u1-1.jpg");
    expect(url).toBe(
      "https://s3.eu-central-003.backblazeb2.com/my-bucket/uploads/avatars/u1-1.jpg",
    );
  });

  it("encodes keys with special characters", () => {
    const cfg = {
      endpoint: "https://s3.eu-central-003.backblazeb2.com",
      region: "eu-central-003",
      accessKeyId: "k",
      secretAccessKey: "s",
      bucket: "b",
      prefix: "uploads/",
      forcePathStyle: true,
    };
    const url = publicURLForKey(cfg, "avatars/has space & plus.jpg");
    expect(url).toBe(
      "https://s3.eu-central-003.backblazeb2.com/b/avatars/has%20space%20%26%20plus.jpg",
    );
  });

  it("strips trailing slashes from the endpoint", () => {
    const cfg = {
      endpoint: "https://example.com/",
      region: "us-east-1",
      accessKeyId: "k",
      secretAccessKey: "s",
      bucket: "b",
      prefix: "uploads/",
      forcePathStyle: true,
    };
    expect(publicURLForKey(cfg, "x")).toBe("https://example.com/b/x");
  });

  it("returns a virtual-hosted AWS S3 URL when no endpoint is set", () => {
    const cfg = {
      endpoint: undefined,
      region: "us-east-1",
      accessKeyId: "k",
      secretAccessKey: "s",
      bucket: "my-bucket",
      prefix: "uploads/",
      forcePathStyle: false,
    };
    expect(publicURLForKey(cfg, "x.jpg")).toBe(
      "https://my-bucket.s3.us-east-1.amazonaws.com/x.jpg",
    );
  });

  it("honours BACKUP_S3_PUBLIC_URL_TEMPLATE when set", () => {
    const cfg = {
      endpoint: "https://example.com",
      region: "us-east-1",
      accessKeyId: "k",
      secretAccessKey: "s",
      bucket: "b",
      prefix: "uploads/",
      forcePathStyle: true,
    };
    const restore = setEnv({
      BACKUP_S3_ACCESS_KEY_ID: "k",
      BACKUP_S3_SECRET_ACCESS_KEY: "s",
      BACKUP_S3_BUCKET: "b",
      BACKUP_S3_PUBLIC_URL_TEMPLATE: "https://cdn.example.com/zerotrust/{key}",
    });
    try {
      expect(publicURLForKey(cfg, "avatars/u1.jpg")).toBe(
        "https://cdn.example.com/zerotrust/avatars/u1.jpg",
      );
    } finally {
      restore();
    }
  });
});

// ── CDN delivery + cache config (uploads) ───────────────────────────────────

describe("getUploadCacheControl", () => {
  it("defaults to a long-lived immutable policy", () => {
    const restore = setEnv({});
    try {
      expect(getUploadCacheControl()).toBe(
        "public, max-age=31536000, immutable",
      );
    } finally {
      restore();
    }
  });

  it("honours UPLOADS_CACHE_CONTROL when set", () => {
    const restore = setEnv({ UPLOADS_CACHE_CONTROL: "public, max-age=600" });
    try {
      expect(getUploadCacheControl()).toBe("public, max-age=600");
    } finally {
      restore();
    }
  });
});

describe("uploadCdnBaseUrl", () => {
  it("returns null when UPLOADS_CDN_URL is unset", () => {
    const restore = setEnv({});
    try {
      expect(uploadCdnBaseUrl()).toBeNull();
    } finally {
      restore();
    }
  });

  it("trims trailing slashes", () => {
    const restore = setEnv({ UPLOADS_CDN_URL: "https://cdn.example.com///" });
    try {
      expect(uploadCdnBaseUrl()).toBe("https://cdn.example.com");
    } finally {
      restore();
    }
  });
});

describe("cdnURLForKey", () => {
  const cfg = {
    endpoint: "https://s3.eu-central-003.backblazeb2.com",
    region: "eu-central-003",
    accessKeyId: "k",
    secretAccessKey: "s",
    bucket: "my-bucket",
    prefix: "uploads/",
    forcePathStyle: true,
  };

  it("routes through UPLOADS_CDN_URL when configured", () => {
    const restore = setEnv({ UPLOADS_CDN_URL: "https://cdn.example.com" });
    try {
      expect(cdnURLForKey(cfg, "uploads/avatars/u1.jpg")).toBe(
        "https://cdn.example.com/uploads/avatars/u1.jpg",
      );
    } finally {
      restore();
    }
  });

  it("encodes special characters in the key under the CDN host", () => {
    const restore = setEnv({ UPLOADS_CDN_URL: "https://cdn.example.com" });
    try {
      expect(cdnURLForKey(cfg, "uploads/has space & plus.jpg")).toBe(
        "https://cdn.example.com/uploads/has%20space%20%26%20plus.jpg",
      );
    } finally {
      restore();
    }
  });

  it("falls back to the origin publicURLForKey when no CDN is set", () => {
    const restore = setEnv({});
    try {
      expect(cdnURLForKey(cfg, "uploads/avatars/u1.jpg")).toBe(
        "https://s3.eu-central-003.backblazeb2.com/my-bucket/uploads/avatars/u1.jpg",
      );
    } finally {
      restore();
    }
  });
});

// ── parseObjectKeyFromPublicUrl ─────────────────────────────────────────────

describe("parseObjectKeyFromPublicUrl", () => {
  it("extracts the key from a Backblaze B2 path-style URL", () => {
    const url =
      "https://s3.eu-central-003.backblazeb2.com/my-bucket/uploads/avatars/u1.jpg";
    expect(parseObjectKeyFromPublicUrl(url)).toBe("uploads/avatars/u1.jpg");
  });

  it("extracts the key from an AWS virtual-hosted URL", () => {
    const url = "https://my-bucket.s3.us-east-1.amazonaws.com/uploads/x.jpg";
    expect(parseObjectKeyFromPublicUrl(url)).toBe("uploads/x.jpg");
  });

  it("returns null for a local-disk URL", () => {
    expect(
      parseObjectKeyFromPublicUrl(
        "http://localhost:3000/uploads/avatars/x.jpg",
      ),
    ).toBeNull();
  });

  it("returns null for invalid URLs", () => {
    expect(parseObjectKeyFromPublicUrl("not a url")).toBeNull();
  });

  it("decodes percent-encoded paths", () => {
    const url =
      "https://s3.eu-central-003.backblazeb2.com/b/avatars/has%20space.jpg";
    expect(parseObjectKeyFromPublicUrl(url)).toBe("avatars/has space.jpg");
  });
});

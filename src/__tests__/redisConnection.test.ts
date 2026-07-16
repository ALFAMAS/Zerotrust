import { describe, expect, it } from "vitest";
import { BULLMQ_QUEUE_NAMES, parseRedisConnection } from "../jobs/queueConfig";

describe("BullMQ queue configuration", () => {
  it("parses authenticated Redis URLs without exposing the original URI", () => {
    expect(parseRedisConnection("redis://worker:p%40ss@redis.internal:6380/2")).toEqual({
      host: "redis.internal",
      port: 6380,
      username: "worker",
      password: "p@ss",
      db: 2,
    });
  });

  it("enables TLS for rediss and rejects unsupported or malformed URLs", () => {
    expect(parseRedisConnection("rediss://cache.example.com:6380")).toEqual({
      host: "cache.example.com",
      port: 6380,
      tls: {},
    });
    expect(parseRedisConnection("https://cache.example.com")).toBeNull();
    expect(parseRedisConnection("not-a-url")).toBeNull();
  });

  it("defines every operational queue in one stable registry", () => {
    expect(BULLMQ_QUEUE_NAMES).toEqual([
      "zerotrust-email",
      "zerotrust-scheduled-jobs",
      "zerotrust-stripe-webhooks",
    ]);
  });
});

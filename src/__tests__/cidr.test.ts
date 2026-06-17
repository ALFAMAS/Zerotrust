import { describe, it, expect } from "vitest";
import { cidrContains, ipMatchesAny, isValidCidrOrIp } from "../shared/cidr";

describe("cidrContains", () => {
  it("matches inside a /24", () => {
    expect(cidrContains("203.0.113.0/24", "203.0.113.5")).toBe(true);
    expect(cidrContains("203.0.113.0/24", "203.0.114.5")).toBe(false);
  });

  it("matches inside a /8", () => {
    expect(cidrContains("10.0.0.0/8", "10.255.1.2")).toBe(true);
    expect(cidrContains("10.0.0.0/8", "11.0.0.1")).toBe(false);
  });

  it("treats a bare IP as an exact match", () => {
    expect(cidrContains("192.168.1.1", "192.168.1.1")).toBe(true);
    expect(cidrContains("192.168.1.1", "192.168.1.2")).toBe(false);
  });

  it("/0 matches everything", () => {
    expect(cidrContains("0.0.0.0/0", "8.8.8.8")).toBe(true);
  });

  it("returns false for malformed input rather than throwing", () => {
    expect(cidrContains("not-a-cidr", "1.2.3.4")).toBe(false);
    expect(cidrContains("10.0.0.0/8", "not-an-ip")).toBe(false);
    expect(cidrContains("10.0.0.0/99", "10.0.0.1")).toBe(false);
    expect(cidrContains("::1/64", "::1")).toBe(false); // IPv6 unsupported → false
  });
});

describe("ipMatchesAny", () => {
  it("an empty list means no restriction", () => {
    expect(ipMatchesAny("1.2.3.4", [])).toBe(true);
  });

  it("matches when any range contains the ip", () => {
    expect(ipMatchesAny("10.1.1.1", ["203.0.113.0/24", "10.0.0.0/8"])).toBe(true);
    expect(ipMatchesAny("172.16.0.1", ["203.0.113.0/24", "10.0.0.0/8"])).toBe(false);
  });

  it("an empty ip against a non-empty list is denied", () => {
    expect(ipMatchesAny("", ["10.0.0.0/8"])).toBe(false);
  });
});

describe("isValidCidrOrIp", () => {
  it("accepts valid IPs and CIDRs", () => {
    expect(isValidCidrOrIp("192.168.0.1")).toBe(true);
    expect(isValidCidrOrIp("10.0.0.0/8")).toBe(true);
    expect(isValidCidrOrIp("0.0.0.0/0")).toBe(true);
  });

  it("rejects malformed values", () => {
    expect(isValidCidrOrIp("999.1.1.1")).toBe(false);
    expect(isValidCidrOrIp("10.0.0.0/33")).toBe(false);
    expect(isValidCidrOrIp("hello")).toBe(false);
  });
});
